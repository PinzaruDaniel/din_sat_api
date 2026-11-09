import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCatalogService } from '../../src/application/features/catalog/catalogService.js';
import { createProducersService } from '../../src/application/features/producers/producersService.js';
import { createPostgresPool } from '../../src/infrastructure/persistence/connections/createPostgresPool.js';
import { createPostgresDatabase } from '../../src/infrastructure/persistence/connections/createPostgresDatabase.js';
import { migrate } from '../../src/infrastructure/persistence/migrations/migrate.js';

const url = process.env.TEST_DATABASE_URL;

test(
  'PostgreSQL persists profiles, uploaded image bytes and archived product data across reconnection',
  { skip: !url },
  async (t) => {
    assert.match(new URL(url).pathname.slice(1), /(?:^|_)test(?:$|_)/);
    const schema = `dinsat_catalog_test_${randomUUID().replaceAll('-', '')}`;
    const admin = createPostgresPool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const options = {
      connectionString: url,
      options: `-c search_path=${schema}`,
    };
    let pool = createPostgresPool(options);
    t.after(async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });

    await migrate(pool);
    let database = createPostgresDatabase({ pool });
    let catalog = createCatalogService(database);
    let producers = createProducersService(database);
    const producer = await database.users.create({
      name: 'Producer',
      email: 'producer@example.md',
      role: 'producer',
      passwordHash: 'test-hash',
    });
    const input = {
      name: 'Producer nou',
      locality: 'Cahul',
      description: 'Produse proaspete din gospodărie.',
    };
    await producers.update(producer, input);
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQSrYDAAFuAMTo5d1kAAAAAElFTkSuQmCC',
      'base64',
    );
    const upload = await catalog.upload(producer, 'image/png', bytes);
    const created = await catalog.create(producer, {
      title: 'Mere parfumate',
      description: 'Din livada familiei.',
      category: 'fructe',
      unit: 'kg',
      priceAmount: '25.95',
      availableQuantity: 5,
      imageUrl: upload.imageUrl,
    });
    await pool.end();
    pool = createPostgresPool(options);
    database = createPostgresDatabase({ pool });
    catalog = createCatalogService(database);
    producers = createProducersService(database);

    assert.deepEqual(await producers.details(producer.id), {
      id: producer.id,
      ...input,
    });
    assert.deepEqual(await catalog.image(upload.imageUrl.split('/').at(-1)), {
      mediaType: 'image/png',
      bytes,
    });
    const updated = await catalog.update(producer, created.id, {
      priceAmount: '27.95',
    });
    assert.equal(updated.availableQuantity, 5);
    assert.equal(updated.imageUrl, upload.imageUrl);
    await catalog.archive(producer, created.id);
    await assert.rejects(catalog.details(created.id), {
      code: 'PRODUCT_NOT_FOUND',
    });
    assert.deepEqual(await catalog.owned(producer), [
      { ...updated, active: false },
    ]);
  },
);
