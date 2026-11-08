import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createRuntime } from '../../src/app/container/createRuntime.js';
import { createApp } from '../../src/app/createApp.js';
import { createPostgresPool } from '../../src/infrastructure/persistence/connections/createPostgresPool.js';
import { migrate } from '../../src/infrastructure/persistence/migrations/migrate.js';

const url = process.env.TEST_DATABASE_URL;
test(
  'PostgreSQL session survives runtime restart and logout remains revoked after restart',
  { skip: !url },
  async (t) => {
    assert.match(new URL(url).pathname.slice(1), /(?:^|_)test(?:$|_)/);
    const schema = `dinsat_test_${randomUUID().replaceAll('-', '')}`;
    const admin = createPostgresPool({ connectionString: url });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scopedUrl = new URL(url);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    const migrationPool = createPostgresPool({
      connectionString: scopedUrl.toString(),
    });
    await migrate(migrationPool);
    await migrationPool.end();
    const runtimes = new Set();
    t.after(async () => {
      for (const runtime of runtimes) await runtime.close();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    const origin = 'http://localhost:5173';
    const config = {
      demo: false,
      production: false,
      databaseUrl: scopedUrl.toString(),
      poolMax: 2,
      sessionSecret:
        'stable-secret-for-session-restart-test-minimum-thirty-two',
      origin,
      cookieSameSite: 'lax',
      authLimit: 100,
    };
    const start = async () => {
      const runtime = await createRuntime(config);
      runtimes.add(runtime);
      return { runtime, app: createApp({ ...runtime, config }) };
    };
    const close = async (runtime) => {
      await runtime.close();
      runtimes.delete(runtime);
    };
    const first = await start();
    const agent = request.agent(first.app);
    const initial = await agent.get('/api/v1/auth/session').expect(200);
    const registered = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', initial.body.csrfToken)
      .send({
        name: 'Persistent Buyer',
        email: 'persistent@dinsat.test',
        role: 'buyer',
        password: 'long-test-password-for-postgres',
      })
      .expect(201);
    const cookie = registered.headers['set-cookie'][0].split(';')[0];
    assert.match(registered.headers['set-cookie'][0], /HttpOnly/);
    assert.equal(registered.body.user.passwordHash, undefined);
    await close(first.runtime);

    const second = await start();
    const restored = await request(second.app)
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    assert.equal(restored.body.user.id, registered.body.user.id);
    assert.equal(restored.body.csrfToken, registered.body.csrfToken);
    await request(second.app)
      .get('/api/v1/orders')
      .set('Cookie', cookie)
      .expect(200);
    await request(second.app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('X-CSRF-Token', restored.body.csrfToken)
      .expect(204);
    await close(second.runtime);

    const third = await start();
    await request(third.app)
      .get('/api/v1/orders')
      .set('Cookie', cookie)
      .expect(401);
    const revoked = await request(third.app)
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    assert.equal(revoked.body.user, null);
  },
);
