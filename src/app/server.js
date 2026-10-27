import { randomBytes } from 'node:crypto';
import { createApp } from './createApp.js';
import { createServices } from './container/createServices.js';
import { createDemoDatabase } from '../infrastructure/persistence/connections/createDemoDatabase.js';
import { createPasswords } from '../infrastructure/security/passwords.js';
const production = process.env.NODE_ENV === 'production';
const demo =
  process.env.DEMO_MODE === 'true' ||
  (!production && process.env.DEMO_MODE !== 'false');
if (!demo || production)
  throw new Error(
    'Connect the external repository adapters and durable session store before starting outside demo mode. See docs/architecture/persistence.md.',
  );
const passwords = await createPasswords();
const repositories = createDemoDatabase();
for (const role of ['buyer', 'producer']) {
  await repositories.users.create({
    name: role === 'buyer' ? 'Ana Popescu' : 'Livada Anei',
    email: `${role}@dinsat.demo`,
    role,
    passwordHash: await passwords.hash('DinSatDemo2026!'),
  });
}
const services = createServices({ repositories, passwords });
const app = createApp({
  services,
  config: {
    production,
    demo,
    origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
    sessionSecret:
      process.env.SESSION_SECRET ?? randomBytes(48).toString('hex'),
  },
});
const server = app.listen(Number(process.env.PORT ?? 3001), '127.0.0.1', () =>
  console.info(
    'DinSat API: http://localhost:3001/api/v1 — DEMO: data resets on restart.',
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close();
  });
