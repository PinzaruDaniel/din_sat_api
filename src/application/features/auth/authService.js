import { AppError } from '../../../shared/errors/AppError.js';
import { toPublicUser } from '../../../domain/features/auth/user.js';

/** users: findByEmail(email), findById(id), create(input). passwords: hash(), verify(). */
export function createAuthService({ users, passwords }) {
  return {
    async register(input) {
      const passwordHash = await passwords.hash(input.password);
      const user = await users.create({
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash,
      });
      return toPublicUser(user);
    },
    async login({ email, password }) {
      const user = await users.findByEmail(email);
      // Verify a real hash even when the email is unknown to reduce timing differences.
      const valid = await passwords.verify(
        user?.passwordHash ?? passwords.dummyHash,
        password,
      );
      if (!user || !valid)
        throw new AppError(
          401,
          'INVALID_CREDENTIALS',
          'Emailul sau parola nu este corectă.',
        );
      return toPublicUser(user);
    },
    async getUser(id) {
      const user = await users.findById(id);
      if (!user)
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Autentifică-te pentru a continua.',
        );
      return toPublicUser(user);
    },
  };
}
