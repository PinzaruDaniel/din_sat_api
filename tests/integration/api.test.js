import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app/createApp.js';
import { createServices } from '../../src/app/container/createServices.js';
import { createDemoDatabase } from '../../src/infrastructure/persistence/connections/createDemoDatabase.js';
import { createPasswords } from '../../src/infrastructure/security/passwords.js';
let passwords, app, repositories;
const origin = 'http://localhost:5173';
before(async () => {
  passwords = await createPasswords();
});
beforeEach(() => {
  repositories = createDemoDatabase();
  app = createApp({
    services: createServices({ repositories, passwords }),
    config: {
      sessionSecret: 'test-secret-with-at-least-thirty-two-characters',
      demo: true,
      production: false,
      origin,
      authLimit: 100,
    },
  });
});
async function register(role = 'buyer', email = `${role}@example.md`) {
  const agent = request.agent(app);
  const session = await agent.get('/api/v1/auth/session').expect(200);
  const response = await agent
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', session.body.csrfToken)
    .send({
      name: 'Test Account',
      email,
      password: 'a-long-test-password',
      role,
    })
    .expect(201);
  return { agent, token: response.body.csrfToken, user: response.body.user };
}
const mutation = (client, method, path) =>
  client.agent[method](path)
    .set('Origin', origin)
    .set('X-CSRF-Token', client.token);
const checkout = {
  items: [{ productId: 'product-1', quantity: 2 }],
  pickupSlotId: 'producer-1-slot-1',
};

test('session cookie is HttpOnly, session rotates at login, logout revokes it', async () => {
  const client = await register();
  assert.equal(client.user.passwordHash, undefined);
  const session = await client.agent.get('/api/v1/auth/session').expect(200);
  assert.equal(session.body.user.email, 'buyer@example.md');
  const oldCookie = session.headers['set-cookie']?.[0];
  const login = await mutation(client, 'post', '/api/v1/auth/login')
    .send({ email: 'buyer@example.md', password: 'a-long-test-password' })
    .expect(200);
  assert.notEqual(login.body.csrfToken, client.token);
  assert.match(login.headers['set-cookie'][0], /HttpOnly/);
  assert.match(login.headers['set-cookie'][0], /SameSite=Lax/);
  if (oldCookie) assert.notEqual(login.headers['set-cookie'][0], oldCookie);
  client.token = login.body.csrfToken;
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await mutation(client, 'post', '/api/v1/auth/logout').expect(204);
  await request(app).get('/api/v1/orders').set('Cookie', cookie).expect(401);
  assert.equal(
    (await client.agent.get('/api/v1/auth/session')).body.user,
    null,
  );
});

test('rejects invalid credentials, weak passwords, duplicate email and admin role', async () => {
  const client = await register();
  const invalid = await mutation(client, 'post', '/api/v1/auth/login')
    .send({ email: 'buyer@example.md', password: 'wrong' })
    .expect(401);
  assert.equal(invalid.body.code, 'INVALID_CREDENTIALS');
  for (const change of [
    { password: 'short' },
    { role: 'admin' },
    { email: 'invalid' },
  ]) {
    const response = await mutation(client, 'post', '/api/v1/auth/register')
      .send({
        name: 'Test',
        email: 'new@example.md',
        password: 'a-long-test-password',
        role: 'buyer',
        ...change,
      })
      .expect(400);
    assert.equal(response.body.code, 'VALIDATION_ERROR');
    assert.ok(response.body.requestId);
  }
  await mutation(client, 'post', '/api/v1/auth/register')
    .send({
      name: 'Test',
      email: 'BUYER@example.md',
      password: 'a-long-test-password',
      role: 'buyer',
    })
    .expect(409);
});

test('CSRF is session-bound; rejects missing tokens and unexpected origins', async () => {
  const client = await register();
  await client.agent.post('/api/v1/auth/logout').expect(403);
  const other = await register('buyer', 'other@example.md');
  await client.agent
    .post('/api/v1/auth/logout')
    .set('X-CSRF-Token', other.token)
    .expect(403);
  await client.agent
    .post('/api/v1/auth/logout')
    .set('Origin', 'https://evil.example')
    .set('X-CSRF-Token', client.token)
    .expect(403);
});

test('catalog combines filters, validates pagination, returns public DTOs', async () => {
  const result = await request(app)
    .get('/api/v1/products?q=Roșii&category=legume&locality=Ialoveni')
    .expect(200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].priceAmount, '35.00');
  assert.equal(result.body.items[0].producer.passwordHash, undefined);
  await request(app).get('/api/v1/products?pageSize=999').expect(400);
  await request(app).get('/api/v1/products/not-found').expect(404);
});

test('only producers can publish; ownership comes from the session', async () => {
  const buyer = await register();
  const producer = await register('producer');
  const input = {
    title: 'Fresh carrots',
    description: 'Freshly picked local carrots.',
    category: 'legume',
    unit: 'kg',
    priceAmount: '20.00',
    availableQuantity: 5,
    imageUrl: 'https://example.com/carrots.jpg',
  };
  await mutation(buyer, 'post', '/api/v1/products').send(input).expect(403);
  await mutation(producer, 'post', '/api/v1/products')
    .send({ ...input, producerId: 'someone-else' })
    .expect(400);
  const result = await mutation(producer, 'post', '/api/v1/products')
    .send(input)
    .expect(201);
  assert.equal(result.body.producerId, producer.user.id);
  const listing = await request(app)
    .get(`/api/v1/products?producerId=${producer.user.id}`)
    .expect(200);
  assert.equal(listing.body.total, 1);
});

test('checkout computes prices, replays idempotently and rejects changed payloads', async () => {
  const client = await register();
  const key = 'checkout-key-1234567890';
  const first = await mutation(client, 'post', '/api/v1/orders')
    .set('Idempotency-Key', key)
    .send(checkout)
    .expect(201);
  assert.equal(first.body.totalAmount, '70.00');
  const replay = await mutation(client, 'post', '/api/v1/orders')
    .set('Idempotency-Key', key)
    .send(checkout)
    .expect(201);
  assert.equal(replay.body.id, first.body.id);
  assert.equal(
    (await request(app).get('/api/v1/products/product-1')).body
      .availableQuantity,
    28,
  );
  await mutation(client, 'post', '/api/v1/orders')
    .set('Idempotency-Key', key)
    .send({ ...checkout, items: [{ productId: 'product-1', quantity: 3 }] })
    .expect(409);
  const orders = await client.agent.get('/api/v1/orders').expect(200);
  assert.equal(orders.body.items.length, 1);
});

test('rejects duplicate lines, mixed producers, price injection and wrong pickup slots', async () => {
  const client = await register();
  const create = (input) =>
    mutation(client, 'post', '/api/v1/orders')
      .set('Idempotency-Key', 'checkout-invalid-123456789')
      .send(input);
  await create({ ...checkout, totalAmount: '0.01' }).expect(400);
  await create({
    ...checkout,
    items: [...checkout.items, ...checkout.items],
  }).expect(400);
  await create({
    ...checkout,
    items: [...checkout.items, { productId: 'product-2', quantity: 1 }],
  }).expect(400);
  await create({ ...checkout, pickupSlotId: 'producer-2-slot-1' }).expect(409);
  assert.equal(
    (await request(app).get('/api/v1/products/product-1')).body
      .availableQuantity,
    30,
  );
});

test('order lists and mutations isolate accounts; repeated cancellation restores once', async () => {
  const client = await register();
  const other = await register('buyer', 'other@example.md');
  const producer = await register('producer');
  const order = await mutation(client, 'post', '/api/v1/orders')
    .set('Idempotency-Key', 'checkout-owner-123456789')
    .send(checkout)
    .expect(201);
  assert.equal((await other.agent.get('/api/v1/orders')).body.items.length, 0);
  assert.equal(
    (await producer.agent.get('/api/v1/orders')).body.items.length,
    0,
  );
  await mutation(other, 'patch', `/api/v1/orders/${order.body.id}/status`)
    .send({ status: 'cancelled' })
    .expect(403);
  await mutation(producer, 'patch', `/api/v1/orders/${order.body.id}/status`)
    .send({ status: 'confirmed' })
    .expect(403);
  await mutation(client, 'patch', `/api/v1/orders/${order.body.id}/status`)
    .send({ status: 'confirmed' })
    .expect(403);
  for (let attempt = 0; attempt < 2; attempt++)
    await mutation(client, 'patch', `/api/v1/orders/${order.body.id}/status`)
      .send({ status: 'cancelled' })
      .expect(200);
  assert.equal(
    (await request(app).get('/api/v1/products/product-1')).body
      .availableQuantity,
    30,
  );
  await mutation(client, 'patch', `/api/v1/orders/${order.body.id}/status`)
    .send({ status: 'completed' })
    .expect(403);
});

test('demo concurrent checkout cannot oversell and failed checkout leaves no reservation', async () => {
  const a = await register('buyer', 'a@example.md');
  const b = await register('buyer', 'b@example.md');
  const input = {
    ...checkout,
    items: [{ productId: 'product-1', quantity: 30 }],
  };
  const responses = await Promise.all(
    [a, b].map((client, index) =>
      mutation(client, 'post', '/api/v1/orders')
        .set('Idempotency-Key', `parallel-checkout-${index}`)
        .send(input),
    ),
  );
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(
    (await request(app).get('/api/v1/products/product-1')).body
      .availableQuantity,
    0,
  );
  assert.equal(
    (await request(app).get('/api/v1/pickup-slots?producerId=producer-1')).body
      .items[0].capacity,
    9,
  );
});

test('production rejects the development adapter and missing session secrets', () => {
  const services = createServices({ repositories, passwords });
  assert.throws(
    () =>
      createApp({
        services,
        config: { production: true, demo: true, sessionSecret: 'x'.repeat(32) },
      }),
    /external persistence/,
  );
  assert.throws(
    () => createApp({ services, config: { sessionSecret: 'short' } }),
    /SESSION_SECRET/,
  );
});

test('pickup slots belong to the session producer and reject invalid times and buyer access', async () => {
  const producer = await register('producer');
  const buyer = await register();
  const start = new Date(Date.now() + 86400000);
  const input = {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7200000).toISOString(),
    location: 'Piața centrală, Chișinău',
    capacity: 2,
  };
  await mutation(buyer, 'post', '/api/v1/pickup-slots').send(input).expect(403);
  await mutation(producer, 'post', '/api/v1/pickup-slots')
    .send({ ...input, producerId: buyer.user.id })
    .expect(400);
  await mutation(producer, 'post', '/api/v1/pickup-slots')
    .send({ ...input, endsAt: input.startsAt })
    .expect(400);
  const result = await mutation(producer, 'post', '/api/v1/pickup-slots')
    .send(input)
    .expect(201);
  assert.equal(result.body.producerId, producer.user.id);
  assert.equal(result.body.timeZone, 'Europe/Chisinau');
  const list = await request(app)
    .get(`/api/v1/pickup-slots?producerId=${producer.user.id}`)
    .expect(200);
  assert.equal(list.body.items.length, 1);
});
