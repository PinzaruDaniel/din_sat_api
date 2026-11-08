import { randomBytes } from 'node:crypto';

function integer(value, fallback, name, min, max) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return Number(value);
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (env.DEMO_MODE !== undefined && !['true', 'false'].includes(env.DEMO_MODE))
    throw new Error('DEMO_MODE must be true or false.');
  const demo =
    env.DEMO_MODE === 'true' ||
    (env.DEMO_MODE === undefined && !production && !env.DATABASE_URL);
  if (production && demo)
    throw new Error('Production requires PostgreSQL; DEMO_MODE must be false.');
  if (!demo && !env.DATABASE_URL)
    throw new Error('DATABASE_URL is required when DEMO_MODE is false.');
  if (!demo) {
    let valid = false;
    try {
      valid = ['postgres:', 'postgresql:'].includes(
        new URL(env.DATABASE_URL).protocol,
      );
    } catch {
      // Do not include a connection string or credentials in validation errors.
    }
    if (!valid)
      throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  }
  const sessionSecret =
    env.SESSION_SECRET || (demo ? randomBytes(48).toString('hex') : undefined);
  if (!sessionSecret || sessionSecret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  const origin = env.APP_ORIGIN ?? 'http://localhost:5173';
  let validOrigin = false;
  try {
    const url = new URL(origin);
    validOrigin =
      ['http:', 'https:'].includes(url.protocol) && url.origin === origin;
  } catch {
    // Report the setting name, never the supplied value.
  }
  if (!validOrigin)
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path.');
  const cookieSameSite = env.COOKIE_SAME_SITE ?? 'lax';
  if (!['lax', 'strict', 'none'].includes(cookieSameSite))
    throw new Error('COOKIE_SAME_SITE must be lax, strict or none.');
  if (cookieSameSite === 'none' && !production)
    throw new Error('Cross-site cookies require HTTPS in production.');
  return {
    production,
    demo,
    origin,
    sessionSecret,
    cookieSameSite,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: integer(env.PORT, 3001, 'PORT', 1, 65535),
    trustProxy: integer(env.TRUST_PROXY, 0, 'TRUST_PROXY', 0, 2),
    databaseUrl: env.DATABASE_URL,
    poolMax: integer(env.DB_POOL_MAX, 5, 'DB_POOL_MAX', 1, 20),
  };
}
