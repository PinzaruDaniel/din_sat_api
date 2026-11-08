import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/app/config/loadConfig.js';

const connected = {
  DATABASE_URL: 'postgresql://localhost/dinsat',
  SESSION_SECRET: 'a-persistent-secret-with-at-least-thirty-two-characters',
};

test('a configured database selects durable mode without an implicit demo fallback', () => {
  assert.equal(loadConfig({}).demo, true);
  assert.equal(loadConfig(connected).demo, false);
  assert.throws(() => loadConfig({ DEMO_MODE: 'false' }), /DATABASE_URL/);
  assert.throws(
    () => loadConfig({ DATABASE_URL: connected.DATABASE_URL }),
    /SESSION_SECRET/,
  );
});

test('production requires PostgreSQL and a persistent secret, and binds to the platform interface', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', DEMO_MODE: 'true' }),
    /Production/,
  );
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL/);
  const config = loadConfig({
    ...connected,
    NODE_ENV: 'production',
    PORT: '8080',
    TRUST_PROXY: '1',
  });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 8080);
  assert.equal(config.trustProxy, 1);
});

test('rejects invalid configuration without disclosing supplied connection credentials', () => {
  assert.throws(
    () =>
      loadConfig({ ...connected, DATABASE_URL: 'invalid-private-credential' }),
    (error) => {
      assert.match(error.message, /DATABASE_URL/);
      assert.ok(!error.message.includes('private-credential'));
      return true;
    },
  );
  for (const override of [
    { PORT: '3001x' },
    { DB_POOL_MAX: '0' },
    { TRUST_PROXY: 'true' },
    { APP_ORIGIN: 'https://example.com/path' },
    { COOKIE_SAME_SITE: 'invalid' },
  ])
    assert.throws(() => loadConfig({ ...connected, ...override }));
  assert.throws(
    () => loadConfig({ ...connected, COOKIE_SAME_SITE: 'none' }),
    /HTTPS/,
  );
  assert.equal(
    loadConfig({
      ...connected,
      NODE_ENV: 'production',
      COOKIE_SAME_SITE: 'none',
    }).cookieSameSite,
    'none',
  );
});
