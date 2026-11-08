import { Pool } from 'pg';
import { normalizePostgresConnectionString } from './normalizePostgresConnectionString.js';

export function createPostgresPool(config) {
  if (!config?.connectionString)
    throw new Error('DATABASE_URL is required for PostgreSQL persistence.');
  const pool = new Pool({
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ...config,
    connectionString: normalizePostgresConnectionString(
      config.connectionString,
    ),
  });
  pool.on('error', (error) => {
    console.error({
      message: 'PostgreSQL idle connection error.',
      code: error.code,
    });
  });
  return pool;
}
