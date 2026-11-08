export function normalizePostgresConnectionString(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    // Leave validation and error handling to the existing config / driver paths.
    return connectionString;
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname.endsWith('.neon.tech')
  )
    return connectionString;

  const mode = url.searchParams.get('sslmode');
  if (mode !== null && mode !== 'require') return connectionString;

  // pg currently treats require as verify-full, but warns that this will change.
  // Keep certificate and hostname verification explicit for Neon connections.
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
