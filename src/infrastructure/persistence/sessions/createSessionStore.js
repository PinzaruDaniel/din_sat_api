import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

const PostgresStore = connectPgSimple(session);

export function createSessionStore(pool) {
  return new PostgresStore({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: 15 * 60,
  });
}
