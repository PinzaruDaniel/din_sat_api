import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../http/middlewares/security.js';
import { validate } from '../../http/middlewares/validation.js';

const profile = z
  .object({
    name: z.string().trim().min(2, 'Introdu cel puțin 2 caractere.').max(100),
    locality: z.string().trim().min(2, 'Introdu o localitate.').max(80),
    description: z
      .string()
      .trim()
      .min(10, 'Descrierea trebuie să aibă cel puțin 10 caractere.')
      .max(2000),
  })
  .strict();

export function createProducersRoutes({ producers, authenticated }) {
  const router = Router();
  const producerOnly = [authenticated, requireRole('producer')];
  router.get('/producers', async (_req, res) =>
    res.json({ items: await producers.list() }),
  );
  router.get('/producers/:id', async (req, res) =>
    res.json(await producers.details(req.params.id)),
  );
  router.get('/producer/profile', producerOnly, async (req, res) =>
    res.json(await producers.details(req.user.id)),
  );
  router.put(
    '/producer/profile',
    producerOnly,
    validate(profile),
    async (req, res) =>
      res.json(await producers.update(req.user, req.validated)),
  );
  return router;
}
