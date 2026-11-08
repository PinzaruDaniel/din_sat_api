import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { withTransaction } from '../transactions/withTransaction.js';

const directory = new URL('../../../../database/migrations/', import.meta.url);

export async function migrate(pool) {
  const names = (await readdir(directory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(name, directory), 'utf8');
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
  return withTransaction(pool, async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('dinsat:migrations', 0))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = new Map(
      (
        await client.query('SELECT name, checksum FROM schema_migrations')
      ).rows.map((row) => [row.name, row.checksum]),
    );
    const changed = [];
    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        if (applied.get(migration.name) !== migration.checksum)
          throw new Error(
            `Applied migration ${migration.name} was modified. Add a new migration instead.`,
          );
        continue;
      }
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [migration.name, migration.checksum],
      );
      changed.push(migration.name);
    }
    return changed;
  });
}
