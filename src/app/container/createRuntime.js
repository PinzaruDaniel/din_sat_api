import { createServices } from './createServices.js';
import { createDemoDatabase } from '../../infrastructure/persistence/connections/createDemoDatabase.js';
import { createPostgresDatabase } from '../../infrastructure/persistence/connections/createPostgresDatabase.js';
import { createPostgresPool } from '../../infrastructure/persistence/connections/createPostgresPool.js';
import { createSessionStore } from '../../infrastructure/persistence/sessions/createSessionStore.js';
import { createPasswords } from '../../infrastructure/security/passwords.js';
import { createGateway } from '../../infrastructure/features/ai/createGateway.js';

export async function createRuntime(config) {
  const passwords = await createPasswords();
  const gateway = config.aiGateway
    ? createGateway(config.aiGateway)
    : undefined;
  if (config.demo) {
    const repositories = createDemoDatabase();
    for (const role of ['buyer', 'producer']) {
      await repositories.users.create({
        name: role === 'buyer' ? 'Ana Popescu' : 'Livada Anei',
        email: `${role}@dinsat.demo`,
        role,
        passwordHash: await passwords.hash('DinSatDemo2026!'),
      });
    }
    return {
      services: createServices({ repositories, passwords, gateway }),
      checkReadiness: async () => {},
      close: async () => {},
    };
  }
  const pool = createPostgresPool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
  });
  pool.on('error', () =>
    console.error('A PostgreSQL connection became unavailable.'),
  );
  try {
    await pool.query('SELECT sid FROM sessions LIMIT 0');
    await pool.query('SELECT id FROM users LIMIT 0');
    const repositories = createPostgresDatabase({ pool });
    const sessionStore = createSessionStore(pool);
    return {
      services: createServices({ repositories, passwords, gateway }),
      sessionStore,
      checkReadiness: async () => {
        await pool.query('SELECT 1');
      },
      close: async () => {
        sessionStore.close();
        await pool.end();
      },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
