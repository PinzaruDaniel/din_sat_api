import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostgresConnectionString } from '../../src/infrastructure/persistence/connections/normalizePostgresConnectionString.js';

const neon =
  'postgresql://user:fake-password@ep-example-pooler.eu-central-1.aws.neon.tech/neondb';

test('Neon missing or require sslmode becomes verify-full while preserving connection details', () => {
  for (const suffix of ['', '?sslmode=require&channel_binding=require']) {
    const source = new URL(neon + suffix);
    const result = new URL(
      normalizePostgresConnectionString(source.toString()),
    );
    assert.equal(result.searchParams.get('sslmode'), 'verify-full');
    assert.equal(result.host, source.host);
    assert.equal(result.pathname, source.pathname);
    assert.equal(result.username, source.username);
    assert.equal(result.password, source.password);
    assert.equal(
      result.searchParams.get('channel_binding'),
      source.searchParams.get('channel_binding'),
    );
  }
});

test('explicit Neon TLS modes are preserved rather than overwritten', () => {
  for (const mode of [
    'verify-full',
    'verify-ca',
    'no-verify',
    'disable',
    'prefer',
  ]) {
    const connectionString = neon + '?sslmode=' + mode;
    assert.equal(
      normalizePostgresConnectionString(connectionString),
      connectionString,
    );
  }
});

test('other providers, local connections and lookalike domains remain unchanged', () => {
  for (const connectionString of [
    'postgresql://localhost:55432/dinsat',
    'postgresql://user:fake-password@provider.example/db?sslmode=require',
    'postgresql://ep-example.neon.tech.attacker.example/db?sslmode=require',
    'https://ep-example.neon.tech/db?sslmode=require',
    'invalid-configuration',
  ])
    assert.equal(
      normalizePostgresConnectionString(connectionString),
      connectionString,
    );
});
