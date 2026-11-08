import { createPostgresPool } from '../src/infrastructure/persistence/connections/createPostgresPool.js';
import { migrate } from '../src/infrastructure/persistence/migrations/migrate.js';
import { seedDemo } from '../src/infrastructure/persistence/seeds/seedDemo.js';
import { selectDatabaseCommandUrl } from '../src/infrastructure/persistence/connections/selectDatabaseCommandUrl.js';

const command = process.argv[2];
if (!['migrate', 'seed', 'check'].includes(command))
  throw new Error('Usage: database.js migrate|seed|check');
const pool = createPostgresPool({
  connectionString: selectDatabaseCommandUrl(process.env, command),
});
try {
  if (command === 'migrate') {
    const applied = await migrate(pool);
    console.info(
      applied.length
        ? `Applied migrations: ${applied.join(', ')}`
        : 'Database migrations are up to date.',
    );
  } else if (command === 'seed') {
    console.info(
      'Demo seed completed without resetting existing records.',
      await seedDemo(pool),
    );
  } else {
    await pool.query('SELECT 1');
    const tables = [
      'users',
      'producers',
      'products',
      'pickup_slots',
      'orders',
      'order_items',
      'idempotency_requests',
      'sessions',
      'schema_migrations',
    ];
    const result = await pool.query(
      'SELECT name, to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name',
      [tables],
    );
    const missing = result.rows
      .filter((row) => !row.present)
      .map((row) => row.name);
    if (missing.length)
      throw new Error(
        `Missing tables: ${missing.join(', ')}. Run npm run db:migrate.`,
      );
    console.info('PostgreSQL connection and application tables are ready.');
  }
} catch (error) {
  console.error({
    message: 'Database command failed.',
    code: error.code ?? 'DATABASE_COMMAND_FAILED',
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
