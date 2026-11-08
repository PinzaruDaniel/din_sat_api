import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';
import { withTransaction } from '../../persistence/transactions/withTransaction.js';

const user = (row) =>
  row && {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
  };

export function createPostgresUsers(pool) {
  return {
    async findByEmail(email) {
      return user(
        (
          await pool.query('SELECT * FROM users WHERE email = $1', [
            email.toLowerCase(),
          ])
        ).rows[0],
      );
    },
    async findById(id) {
      return user(
        (await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0],
      );
    },
    async create(input) {
      try {
        return await withTransaction(pool, async (client) => {
          const result = await client.query(
            'INSERT INTO users (id, name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [
              randomUUID(),
              input.name,
              input.email.toLowerCase(),
              input.role,
              input.passwordHash,
            ],
          );
          const created = user(result.rows[0]);
          if (created.role === 'producer')
            await client.query(
              'INSERT INTO producers (id, name) VALUES ($1, $2)',
              [created.id, created.name],
            );
          return created;
        });
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'users_email_key')
          throw new AppError(
            409,
            'EMAIL_EXISTS',
            'Există deja un cont cu acest email.',
          );
        throw error;
      }
    },
  };
}
