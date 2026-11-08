import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDatabaseCommandUrl } from '../../src/infrastructure/persistence/connections/selectDatabaseCommandUrl.js';

const pooled =
  'postgresql://user:private-password@ep-test-pooler.eu-central-1.aws.neon.tech/neondb';
const direct =
  'postgresql://user:private-password@ep-test.eu-central-1.aws.neon.tech/neondb';
const local = 'postgresql://localhost:55432/dinsat';

test('database CLI prefers explicit migration URL, then the Neon direct URL, then the application URL', () => {
  const env = {
    MIGRATION_DATABASE_URL: local,
    DATABASE_URL_UNPOOLED: direct,
    DATABASE_URL: pooled,
  };
  assert.equal(selectDatabaseCommandUrl(env, 'migrate'), local);
  delete env.MIGRATION_DATABASE_URL;
  assert.equal(selectDatabaseCommandUrl(env, 'migrate'), direct);
  delete env.DATABASE_URL_UNPOOLED;
  env.DATABASE_URL = local;
  assert.equal(selectDatabaseCommandUrl(env, 'migrate'), local);
});

test('migration rejects a pooled Neon endpoint without disclosing connection credentials', () => {
  assert.throws(
    () => selectDatabaseCommandUrl({ DATABASE_URL: pooled }, 'migrate'),
    (error) => {
      assert.match(error.message, /direct PostgreSQL connection/);
      assert.match(error.message, /DATABASE_URL_UNPOOLED/);
      assert.ok(!error.message.includes('private-password'));
      assert.ok(!error.message.includes('ep-test-pooler'));
      return true;
    },
  );
  assert.equal(
    selectDatabaseCommandUrl({ DATABASE_URL: pooled }, 'check'),
    pooled,
  );
});

test('database CLI fails clearly for missing or malformed configuration without echoing supplied values', () => {
  assert.throws(
    () => selectDatabaseCommandUrl({}, 'migrate'),
    /Set DATABASE_URL/,
  );
  for (const value of [
    'private-password',
    'https://user:private-password@example.com',
  ]) {
    assert.throws(
      () => selectDatabaseCommandUrl({ DATABASE_URL: value }, 'migrate'),
      (error) => {
        assert.match(error.message, /PostgreSQL URL/);
        assert.ok(!error.message.includes('private-password'));
        return true;
      },
    );
  }
});
