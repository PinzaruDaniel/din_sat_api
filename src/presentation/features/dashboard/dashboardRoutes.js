import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../http/middlewares/security.js';
import { validate } from '../../http/middlewares/validation.js';

const date = z.iso.date().refine((value) => !value.startsWith('0000-'));
const period = z
  .object({ from: date.optional(), to: date.optional() })
  .strict()
  .refine(({ from, to }) => (!from && !to) || (from && to && from <= to), {
    path: ['to'],
    message:
      'Alege ambele date. Data finală trebuie să fie cel puțin data de început.',
  });

export function createDashboardRoutes({ dashboard, authenticated }) {
  const router = Router();
  router.get(
    '/producer/dashboard',
    authenticated,
    requireRole('producer'),
    validate(period, 'query'),
    async (req, res) =>
      res.json(await dashboard.read(req.user.id, req.validated)),
  );
  return router;
}
