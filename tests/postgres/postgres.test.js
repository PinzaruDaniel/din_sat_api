import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPostgresPool } from '../../src/infrastructure/persistence/connections/createPostgresPool.js';
import { createPostgresDatabase } from '../../src/infrastructure/persistence/connections/createPostgresDatabase.js';
import { migrate } from '../../src/infrastructure/persistence/migrations/migrate.js';
import { seedDemo } from '../../src/infrastructure/persistence/seeds/seedDemo.js';
import { createOrdersService } from '../../src/application/features/orders/ordersService.js';

const url = process.env.TEST_DATABASE_URL;
test(
  'PostgreSQL durability, isolation, atomic checkout and concurrent cancellation',
  { skip: !url },
  async (t) => {
    // All mutations are confined to a random schema in an explicitly named test DB.
    const database = new URL(url).pathname.slice(1);
    assert.match(
      database,
      /(?:^|_)test(?:$|_)/,
      'TEST_DATABASE_URL must reference a test database.',
    );
    const schema = `dinsat_test_${randomUUID().replaceAll('-', '')}`;
    const admin = createPostgresPool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const config = {
      connectionString: url,
      max: 1,
      options: `-c search_path=${schema}`,
    };
    let first = createPostgresPool(config);
    const second = createPostgresPool(config);
    t.after(async () => {
      await Promise.all([first.end(), second.end()]);
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    const migrationResults = await Promise.all([
      migrate(first),
      migrate(second),
    ]);
    assert.deepEqual(
      migrationResults.map((result) => result.length).sort(),
      [0, 1],
    );
    assert.deepEqual(await migrate(first), []);
    const seedDate = new Date();
    assert.equal(
      (await seedDemo(first, { now: seedDate })).pickupSlotsInserted,
      9,
    );
    assert.equal(
      (await seedDemo(first, { now: seedDate })).pickupSlotsInserted,
      0,
    );
    let db = createPostgresDatabase({ pool: first });
    const db2 = createPostgresDatabase({ pool: second });
    const buyer = await db.users.findByEmail('buyer@dinsat.demo');
    const other = await db.users.create({
      name: 'Other Buyer',
      email: 'other@dinsat.test',
      role: 'buyer',
      passwordHash: 'test-hash',
    });
    const producer = await db.users.findByEmail('producer1@dinsat.demo');
    const input = {
      items: [{ productId: 'product-1', quantity: 1 }],
      pickupSlotId: (await db.pickup.list(producer.id))[0].id,
    };
    const services = () => [
      createOrdersService({ orders: db.orders }),
      createOrdersService({ orders: db2.orders }),
    ];
    const reset = async (stock = 1, capacity = 1) => {
      await first.query('DELETE FROM idempotency_requests');
      await first.query('DELETE FROM order_items');
      await first.query('DELETE FROM orders');
      await first.query(
        'UPDATE products SET available_quantity = $1 WHERE id = $2',
        [stock, 'product-1'],
      );
      await first.query('UPDATE pickup_slots SET capacity = $1 WHERE id = $2', [
        capacity,
        input.pickupSlotId,
      ]);
    };
    const state = async () => ({
      stock: (
        await first.query(
          "SELECT available_quantity FROM products WHERE id = 'product-1'",
        )
      ).rows[0].available_quantity,
      capacity: (
        await first.query('SELECT capacity FROM pickup_slots WHERE id = $1', [
          input.pickupSlotId,
        ])
      ).rows[0].capacity,
      orders: Number(
        (await first.query('SELECT count(*) FROM orders')).rows[0].count,
      ),
    });

    await t.test(
      'data survives pool replacement; user/profile creation is atomic; emails are unique',
      async () => {
        const account = await db.users.create({
          name: 'New Producer',
          email: 'UNIQUE@DINSAT.TEST',
          role: 'producer',
          passwordHash: 'test-hash',
        });
        assert.ok(
          (await db.catalog.producers()).some(
            (profile) => profile.id === account.id,
          ),
        );
        await first.end();
        first = createPostgresPool(config);
        db = createPostgresDatabase({ pool: first });
        assert.equal(
          (await db.users.findByEmail('unique@dinsat.test')).id,
          account.id,
        );
        const result = await Promise.allSettled(
          [db, db2].map((repo) =>
            repo.users.create({
              name: 'Duplicate',
              email: 'race@dinsat.test',
              role: 'buyer',
              passwordHash: 'test-hash',
            }),
          ),
        );
        assert.equal(
          result.filter((entry) => entry.status === 'fulfilled').length,
          1,
        );
        assert.equal(
          result.find((entry) => entry.status === 'rejected').reason.code,
          'EMAIL_EXISTS',
        );
      },
    );

    await t.test(
      'distinct PostgreSQL connections contend for the final product',
      async () => {
        const pids = await Promise.all(
          [first, second].map(
            async (pool) =>
              (await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,
          ),
        );
        assert.notEqual(...pids);
        await reset(1, 2);
        const result = await Promise.allSettled(
          services().map((service, index) =>
            service.create(index ? other : buyer, input, `last-stock-${index}`),
          ),
        );
        assert.equal(
          result.filter((entry) => entry.status === 'fulfilled').length,
          1,
        );
        assert.equal(
          result.find((entry) => entry.status === 'rejected').reason.code,
          'OUT_OF_STOCK',
        );
        assert.deepEqual(await state(), { stock: 0, capacity: 1, orders: 1 });
      },
    );

    await t.test(
      'the final pickup place cannot be reserved twice',
      async () => {
        await reset(2, 1);
        const result = await Promise.allSettled(
          services().map((service, index) =>
            service.create(index ? other : buyer, input, `last-slot-${index}`),
          ),
        );
        assert.equal(
          result.filter((entry) => entry.status === 'fulfilled').length,
          1,
        );
        assert.equal(
          result.find((entry) => entry.status === 'rejected').reason.code,
          'SLOT_UNAVAILABLE',
        );
        assert.deepEqual(await state(), { stock: 1, capacity: 0, orders: 1 });
      },
    );

    await t.test(
      'same-key concurrent checkout creates one order and preserves history',
      async () => {
        await reset(3, 3);
        const orders = await Promise.all(
          services().map((service) => service.create(buyer, input, 'same-key')),
        );
        assert.equal(orders[0].id, orders[1].id);
        assert.deepEqual(await state(), { stock: 2, capacity: 2, orders: 1 });
        await seedDemo(first, { now: seedDate });
        assert.deepEqual(await state(), { stock: 2, capacity: 2, orders: 1 });
        await assert.rejects(
          services()[0].create(
            buyer,
            { ...input, items: [{ productId: 'product-1', quantity: 2 }] },
            'same-key',
          ),
          { code: 'IDEMPOTENCY_CONFLICT' },
        );
        await first.query(
          "UPDATE products SET price_amount = 99.00 WHERE id = 'product-1'",
        );
        assert.equal(
          (await db.orders.list(buyer))[0].items[0].priceAmount,
          '35.00',
        );
        assert.equal((await db.orders.list(other)).length, 0);
        assert.equal((await db.orders.list(producer)).length, 1);
        await assert.rejects(
          services()[0].update(other, orders[0].id, 'cancelled'),
          { code: 'FORBIDDEN' },
        );
        await Promise.all(
          services().map((service) =>
            service.update(buyer, orders[0].id, 'cancelled'),
          ),
        );
        assert.deepEqual(await state(), { stock: 3, capacity: 3, orders: 1 });
        assert.equal((await db.orders.list(buyer))[0].status, 'cancelled');
      },
    );

    await t.test(
      'error after reservation rolls back stock, slot, order and idempotency key',
      async () => {
        await reset(3, 3);
        const failing = {
          ...db.orders,
          transaction: (work) =>
            db.orders.transaction((tx) =>
              work({
                ...tx,
                saveRequest: () => {
                  throw new Error('injected write failure');
                },
              }),
            ),
        };
        await assert.rejects(
          createOrdersService({ orders: failing }).create(
            buyer,
            input,
            'rollback-key',
          ),
          /injected write failure/,
        );
        assert.deepEqual(await state(), { stock: 3, capacity: 3, orders: 0 });
        assert.equal(
          Number(
            (await first.query('SELECT count(*) FROM idempotency_requests'))
              .rows[0].count,
          ),
          0,
        );
        await services()[0].create(buyer, input, 'rollback-key');
        assert.deepEqual(await state(), { stock: 2, capacity: 2, orders: 1 });
      },
    );

    await t.test(
      'constraints reject invalid writes and refreshed seeds preserve pickup history',
      async () => {
        await assert.rejects(
          first.query(
            "UPDATE products SET available_quantity = -1 WHERE id = 'product-1'",
          ),
          { code: '23514' },
        );
        await assert.rejects(
          services()[0].create(
            buyer,
            {
              ...input,
              pickupSlotId: (await db.pickup.list('producer-2'))[0].id,
            },
            'wrong-producer',
          ),
          { code: 'SLOT_UNAVAILABLE' },
        );
        assert.deepEqual(await state(), { stock: 2, capacity: 2, orders: 1 });
        const historicalOrder = (await db.orders.list(buyer))[0];
        const pastStart = new Date(seedDate.getTime() - 5 * 86400000);
        await first.query(
          'UPDATE pickup_slots SET starts_at = $1, ends_at = $2 WHERE id = $3',
          [
            pastStart,
            new Date(pastStart.getTime() + 7200000),
            input.pickupSlotId,
          ],
        );
        assert.ok(
          !(await db.pickup.list(producer.id)).some(
            (slot) => slot.id === input.pickupSlotId,
          ),
        );
        const later = new Date(seedDate.getTime() + 5 * 86400000);
        assert.equal(
          (await seedDemo(first, { now: later })).pickupSlotsInserted,
          9,
        );
        assert.equal(
          (await seedDemo(first, { now: later })).pickupSlotsInserted,
          0,
        );
        assert.equal(
          (await first.query('SELECT count(*) FROM pickup_slots')).rows[0]
            .count,
          '18',
        );
        const futureOptions = await db.pickup.list(producer.id);
        assert.ok(
          futureOptions.some((slot) => new Date(slot.startsAt) > later),
        );
        assert.deepEqual((await db.orders.list(buyer))[0], historicalOrder);
        assert.deepEqual(await state(), { stock: 2, capacity: 2, orders: 1 });
      },
    );
  },
);
