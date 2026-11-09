import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app/createApp.js';
import { createServices } from '../../src/app/container/createServices.js';
import { createDemoDatabase } from '../../src/infrastructure/persistence/connections/createDemoDatabase.js';
import { createPasswords } from '../../src/infrastructure/security/passwords.js';

const origin = 'http://localhost:5173';
const base = '/api/v1';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQSrYDAAFuAMTo5d1kAAAAAElFTkSuQmCC',
  'base64',
);
const product = {
  title: 'Mere roșii',
  description: 'Mere proaspăt culese din livadă.',
  category: 'fructe',
  unit: 'kg',
  priceAmount: '17.95',
  availableQuantity: 5,
  imageUrl: 'https://example.com/mere.png',
};
const profile = {
  name: 'Livada din Criuleni',
  locality: 'Criuleni',
  description: 'Fructe proaspete din gospodăria familiei.',
};
let app;
let passwords;

before(async () => {
  passwords = await createPasswords();
});
beforeEach(() => {
  app = createApp({
    services: createServices({ repositories: createDemoDatabase(), passwords }),
    config: {
      sessionSecret: 'test-secret-with-at-least-thirty-two-characters',
      demo: true,
      origin,
    },
  });
});

async function account(role, email) {
  const agent = request.agent(app);
  const session = await agent.get(base + '/auth/session').expect(200);
  const response = await agent
    .post(base + '/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', session.body.csrfToken)
    .send({
      name: 'Cont de test',
      email,
      password: 'a-long-test-password',
      role,
    })
    .expect(201);
  return { agent, csrf: response.body.csrfToken, user: response.body.user };
}

function write(client, method, path) {
  return client.agent[method](base + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', client.csrf);
}

test('profile is editable only by its owner and the public DTO exposes no private fields', async () => {
  const a = await account('producer', 'a@example.md');
  const b = await account('producer', 'b@example.md');
  const buyer = await account('buyer', 'buyer@example.md');
  await request(app)
    .get(base + '/producer/profile')
    .expect(401);
  await buyer.agent.get(base + '/producer/profile').expect(403);
  await write(buyer, 'put', '/producer/profile').send(profile).expect(403);
  await write(a, 'put', '/producer/profile')
    .send({ ...profile, id: b.user.id })
    .expect(400);
  const invalid = await write(a, 'put', '/producer/profile')
    .send({ ...profile, locality: ' ' })
    .expect(400);
  assert.ok(invalid.body.fieldErrors.locality);
  await write(a, 'put', '/producer/profile').send(profile).expect(200);
  const expected = { id: a.user.id, ...profile };
  assert.deepEqual(
    (await a.agent.get(base + '/producer/profile').expect(200)).body,
    expected,
  );
  assert.deepEqual(
    (
      await request(app)
        .get(base + '/producers/' + a.user.id)
        .expect(200)
    ).body,
    expected,
  );
  const unchanged = await b.agent.get(base + '/producer/profile').expect(200);
  assert.equal(unchanged.body.name, 'Cont de test');
  await request(app)
    .get(base + '/producers/unknown')
    .expect(404);
});

test('upload requires a producer, validates bytes, media type and size and scopes saved references', async () => {
  const a = await account('producer', 'a@example.md');
  const b = await account('producer', 'b@example.md');
  const buyer = await account('buyer', 'buyer@example.md');
  await write(buyer, 'post', '/producer/uploads')
    .type('image/png')
    .send(png)
    .expect(403);
  await write(a, 'post', '/producer/uploads')
    .type('image/svg+xml')
    .send(Buffer.from('<svg/>'))
    .expect(415);
  await write(a, 'post', '/producer/uploads')
    .type('image/jpeg')
    .send(png)
    .expect(400);
  await write(a, 'post', '/producer/uploads')
    .type('image/png')
    .send(png.subarray(0, 18))
    .expect(400);
  await write(a, 'post', '/producer/uploads')
    .type('image/png')
    .send(Buffer.alloc(2 * 1024 * 1024 + 1))
    .expect(413);
  const upload = await write(a, 'post', '/producer/uploads')
    .type('image/png')
    .send(png)
    .expect(201);
  const { imageUrl } = upload.body;
  const image = await request(app)
    .get(imageUrl)
    .expect('Content-Type', 'image/png')
    .expect(200);
  assert.deepEqual(image.body, png);
  await write(b, 'post', '/producer/products')
    .send({ ...product, imageUrl })
    .expect(400);
  const created = await write(a, 'post', '/producer/products')
    .send({ ...product, imageUrl })
    .expect(201);
  const detail = await request(app)
    .get(base + '/products/' + created.body.id)
    .expect(200);
  assert.equal(detail.body.imageUrl, imageUrl);
});

test('edit and archive preserve order snapshots, ownership and filtered totals', async () => {
  const a = await account('producer', 'a@example.md');
  const b = await account('producer', 'b@example.md');
  const buyer = await account('buyer', 'buyer@example.md');
  await write(a, 'put', '/producer/profile').send(profile).expect(200);
  for (const [field, value] of [
    ['title', ' '],
    ['unit', 'pachet'],
    ['priceAmount', '0.00'],
    ['priceAmount', '-1.00'],
    ['availableQuantity', -1],
    ['availableQuantity', 2.5],
  ]) {
    const rejected = await write(a, 'post', '/producer/products')
      .send({ ...product, [field]: value })
      .expect(400);
    assert.ok(rejected.body.fieldErrors[field]);
  }
  const first = (
    await write(a, 'post', '/producer/products').send(product).expect(201)
  ).body;
  const second = (
    await write(a, 'post', '/producer/products')
      .send({ ...product, title: 'Mere verzi', priceAmount: '19.00' })
      .expect(201)
  ).body;
  const query =
    '?q=mere&category=fructe&locality=Criuleni&sort=price-asc&pageSize=1';
  for (const [page, id] of [
    [1, first.id],
    [2, second.id],
    [3, undefined],
  ]) {
    const { body } = await request(app)
      .get(base + '/products' + query + '&page=' + page)
      .expect(200);
    assert.deepEqual(
      body.items.map((item) => item.id),
      id ? [id] : [],
    );
    assert.deepEqual([body.total, body.page, body.pageSize], [2, page, 1]);
  }
  assert.equal(
    (
      await request(app)
        .get(base + '/products?q=mere&category=legume&locality=Criuleni')
        .expect(200)
    ).body.total,
    0,
  );
  await request(app)
    .get(base + '/products?page=0')
    .expect(400);

  const path = '/producer/products/' + first.id;
  await write(b, 'patch', path).send({ title: 'Alt produs' }).expect(404);
  await write(b, 'delete', path).expect(404);
  const startsAt = new Date(Date.now() + 86400000);
  const { body: slot } = await write(a, 'post', '/pickup-slots')
    .send({
      startsAt: startsAt.toISOString(),
      endsAt: new Date(+startsAt + 3600000).toISOString(),
      location: 'Piața centrală din Criuleni',
      capacity: 2,
    })
    .expect(201);
  const orderInput = {
    pickupSlotId: slot.id,
    items: [{ productId: first.id, quantity: 2 }],
  };
  const { body: order } = await write(buyer, 'post', '/orders')
    .set('Idempotency-Key', 'catalog-snapshot-order-1')
    .send(orderInput)
    .expect(201);
  const edited = await write(a, 'patch', path)
    .send({ title: 'Mere de vară', priceAmount: '20.00' })
    .expect(200);
  assert.equal(edited.body.availableQuantity, 3);
  await write(a, 'delete', path).expect(204);
  await write(a, 'delete', path).expect(204);
  await request(app)
    .get(base + '/products/' + first.id)
    .expect(404);
  const list = await request(app)
    .get(base + '/products' + query)
    .expect(200);
  assert.equal(list.body.total, 1);
  assert.deepEqual(
    list.body.items.map((item) => item.id),
    [second.id],
  );
  await write(buyer, 'post', '/orders')
    .set('Idempotency-Key', 'catalog-snapshot-order-2')
    .send(orderInput)
    .expect(409);
  const ownProducts = await a.agent
    .get(base + '/producer/products')
    .expect(200);
  assert.equal(
    ownProducts.body.items.find((item) => item.id === first.id).active,
    false,
  );
  const history = await buyer.agent
    .get(base + '/orders/' + order.id)
    .expect(200);
  assert.deepEqual(history.body.items, order.items);
  assert.equal(history.body.items[0].title, 'Mere roșii');
  assert.equal(history.body.totalAmount, '35.90');
});
