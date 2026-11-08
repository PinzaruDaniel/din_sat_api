export function selectDatabaseCommandUrl(env, command) {
  const connectionString =
    env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!connectionString)
    throw new Error(
      'Set DATABASE_URL or DATABASE_URL_UNPOOLED before running database commands.',
    );

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      'The selected database connection must be a PostgreSQL URL.',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error(
      'The selected database connection must be a PostgreSQL URL.',
    );
  if (command === 'migrate' && url.hostname.split('.')[0].endsWith('-pooler'))
    throw new Error(
      'Migrations require a direct PostgreSQL connection. Set DATABASE_URL_UNPOOLED or MIGRATION_DATABASE_URL to the non-pooled endpoint.',
    );
  return connectionString;
}
