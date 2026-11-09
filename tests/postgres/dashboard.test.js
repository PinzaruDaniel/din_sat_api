import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import request from 'supertest';
import { createServices } from '../../src/app/container/createServices.js';
import { createApp } from '../../src/app/createApp.js';
import { dashboardPeriod } from '../../src/domain/features/dashboard/dashboardPeriod.js';
import { createDemoDatabase } from '../../src/infrastructure/persistence/connections/createDemoDatabase.js';
import { createPostgresDatabase } from '../../src/infrastructure/persistence/connections/createPostgresDatabase.js';
import { createPostgresPool } from '../../src/infrastructure/persistence/connections/createPostgresPool.js';
import { migrate } from '../../src/infrastructure/persistence/migrations/migrate.js';
import { createPasswords } from '../../src/infrastructure/security/passwords.js';

const origin = 'http://localhost:5173';
const path = '/api/v1/producer/dashboard';
const period = { from: '2026-03-29', to: '2026-03-29' };
const timeZone = 'Europe/Chisinau';

async function verifyDashboard(repositories) {
  const passwords = await createPasswords();
  const app = createApp({
    services: createServices({ repositories, passwords }),
    config: {
      origin,
      sessionSecret: 'test-secret-with-at-least-thirty-two-characters',
    },
  });
  async function register(role, account) {
    const agent = request.agent(app);
    const session = await agent.get('/api/v1/auth/session').expect(200);
    const {
      body: { user },
    } = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', session.body.csrfToken)
      .send({
        role,
        email: `${account}@dashboard.test`,
        name: `Dashboard ${account}`,
        password: 'test-password-2026',
      })
      .expect(201);
    return { user, agent };
  }

  const buyer = await register('buyer', 'buyer');
  const first = await register('producer', 'first');
  const second = await register('producer', 'second');

  const createProduct = (producer, title, priceAmount) =>
    repositories.catalog.create({
      producerId: producer.user.id,
      title,
      description: 'Produs pentru verificarea raportului.',
      category: 'fructe',
      unit: 'kg',
      priceAmount,
      availableQuantity: 10,
      currency: 'MDL',
      imageUrl: 'https://example.test/product.jpg',
      active: true,
    });
  const apples = await createProduct(first, 'Mere', '15.02');
  const pears = await createProduct(first, 'Pere', '14.99');
  const plums = await createProduct(second, 'Prune', '200.00');

  const createSlot = (producer) =>
    repositories.pickup.create({
      producerId: producer.user.id,
      startsAt: '2026-03-30T07:00:00.000Z',
      endsAt: '2026-03-30T09:00:00.000Z',
      timeZone,
      location: 'Piața locală',
      capacity: 10,
    });
  const firstSlot = await createSlot(first);
  const secondSlot = await createSlot(second);

  async function place({
    createdAt,
    status,
    totalAmount,
    pickup = firstSlot,
    items = [apples],
  }) {
    await repositories.orders.transaction((tx) =>
      tx.saveOrder({
        id: randomUUID(),
        buyerId: buyer.user.id,
        producerId: pickup.producerId,
        pickup,
        status,
        totalAmount,
        createdAt,
        currency: 'MDL',
        items: items.map(({ id, producerId, title, unit, priceAmount }) => ({
          productId: id,
          producerId,
          title,
          unit,
          priceAmount,
          quantity: 1,
        })),
      }),
    );
  }

  // On the spring DST change, March 29 is 23 hours in Europe/Chisinau.
  await place({
    createdAt: '2026-03-28T21:59:59.999Z',
    status: 'completed',
    totalAmount: '15.02',
  });
  await place({
    createdAt: '2026-03-28T22:00:00.000Z',
    status: 'completed',
    totalAmount: '30.01',
    items: [apples, pears],
  });
  await place({
    createdAt: '2026-03-29T20:59:59.999Z',
    status: 'completed',
    totalAmount: '15.02',
    items: [{ ...apples, title: 'Mere din livadă' }],
  });
  await place({
    createdAt: '2026-03-29T21:00:00.000Z',
    status: 'completed',
    totalAmount: '15.02',
  });
  for (const status of ['new', 'confirmed', 'preparing', 'ready', 'cancelled'])
    await place({
      createdAt: '2026-03-29T12:00:00.000Z',
      status,
      totalAmount: '14.99',
      items: [pears],
    });
  await place({
    createdAt: '2026-03-29T10:00:00.000Z',
    status: 'completed',
    totalAmount: '200.00',
    pickup: secondSlot,
    items: [plums],
  });

  await request(app).get(path).query(period).expect(401);
  await buyer.agent.get(path).query(period).expect(403);
  await first.agent
    .get(path)
    .query({ from: '2026-03-31', to: '2026-03-29' })
    .expect(400);
  await first.agent
    .get(path)
    .query({ from: '2026-02-29', to: '2026-03-29' })
    .expect(400);
  await first.agent.get(path).query({ from: period.from }).expect(400);
  await first.agent
    .get(path)
    .query({ ...period, producerId: second.user.id })
    .expect(400);

  const report = await first.agent.get(path).query(period).expect(200);
  assert.deepEqual(report.body, {
    period: { ...period, timeZone },
    orderCount: 7,
    activeCount: 4,
    completedCount: 2,
    cancelledCount: 1,
    completedAmounts: [{ currency: 'MDL', amount: '45.03' }],
    popularProducts: [
      { productId: apples.id, title: 'Mere din livadă', orderCount: 2 },
      { productId: pears.id, title: 'Pere', orderCount: 1 },
    ],
  });
  const other = await second.agent.get(path).query(period).expect(200);
  assert.deepEqual(other.body, {
    period: { ...period, timeZone },
    orderCount: 1,
    activeCount: 0,
    completedCount: 1,
    cancelledCount: 0,
    completedAmounts: [{ currency: 'MDL', amount: '200.00' }],
    popularProducts: [{ productId: plums.id, title: 'Prune', orderCount: 1 }],
  });
  const emptyPeriod = { from: '2026-04-01', to: '2026-04-01' };
  const empty = await first.agent.get(path).query(emptyPeriod).expect(200);
  assert.deepEqual(empty.body, {
    period: { ...emptyPeriod, timeZone },
    orderCount: 0,
    activeCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    completedAmounts: [{ currency: 'MDL', amount: '0.00' }],
    popularProducts: [],
  });
  const current = await first.agent.get(path).expect(200);
  assert.deepEqual(current.body.period, dashboardPeriod({}));
}

test('dashboard uses thirty local calendar days by default', () => {
  assert.deepEqual(dashboardPeriod({}, new Date('2026-03-31T21:30:00Z')), {
    from: '2026-03-03',
    to: '2026-04-01',
    timeZone,
  });
});

test('demo dashboard reconciles statuses, ownership and DST boundaries', () =>
  verifyDashboard(createDemoDatabase()));

const url = process.env.TEST_DATABASE_URL;
test(
  'PostgreSQL dashboard reconciles statuses, ownership and DST boundaries',
  { skip: !url },
  async (t) => {
    assert.match(new URL(url).pathname.slice(1), /(?:^|_)test(?:$|_)/);
    const schema = `dinsat_test_${randomUUID().replaceAll('-', '')}`;
    const admin = createPostgresPool({ connectionString: url });
    const pool = createPostgresPool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    t.after(async () => {
      await pool.end();
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
    });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await migrate(pool);
    await verifyDashboard(createPostgresDatabase({ pool }));
  },
);
