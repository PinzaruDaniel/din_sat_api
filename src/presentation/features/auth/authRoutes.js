import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../http/middlewares/validation.js';
import { ensureCsrf } from '../../http/middlewares/security.js';
const credentials = z
  .object({
    email: z
      .email('Introdu un email valid.')
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
const registration = credentials.extend({
  name: z.string().trim().min(2).max(80),
  password: z.string().min(12, 'Folosește cel puțin 12 caractere.').max(128),
  role: z.enum(['buyer', 'producer']),
});
const regenerate = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
const save = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );

export function createAuthRoutes({ auth, authLimiter, cookieOptions }) {
  const router = Router();
  router.get('/session', async (req, res) => {
    const user = req.session.userId
      ? await auth.getUser(req.session.userId)
      : null;
    res.json({ user, csrfToken: ensureCsrf(req) });
  });
  for (const action of ['login', 'register']) {
    router.post(
      `/${action}`,
      authLimiter,
      validate(action === 'login' ? credentials : registration),
      async (req, res) => {
        const user = await auth[action](req.validated);
        await regenerate(req);
        req.session.userId = user.id;
        const csrfToken = ensureCsrf(req);
        await save(req);
        res.status(action === 'register' ? 201 : 200).json({ user, csrfToken });
      },
    );
  }
  router.post('/logout', async (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie('dinsat.sid', cookieOptions);
      res.status(204).end();
    });
  });
  return router;
}
