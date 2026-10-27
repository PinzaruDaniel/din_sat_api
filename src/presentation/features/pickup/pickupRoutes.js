import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../http/middlewares/validation.js';
import { requireRole } from '../../http/middlewares/security.js';
const slotSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: z.string().trim().min(5).max(200),
    capacity: z.number().int().min(1).max(1000),
  })
  .strict()
  .refine(
    (input) => {
      const start = new Date(input.startsAt).getTime();
      const end = new Date(input.endsAt).getTime();
      return (
        start > Date.now() &&
        end > start &&
        end - start <= 8 * 3600000 &&
        start < Date.now() + 180 * 86400000
      );
    },
    {
      message:
        'Alege un interval viitor de maximum 8 ore, în următoarele 180 de zile.',
      path: ['startsAt'],
    },
  );
export function createPickupRoutes({ pickup, authenticated }) {
  const router = Router();
  router.get(
    '/pickup-slots',
    validate(
      z.object({ producerId: z.string().min(1).max(80) }).strict(),
      'query',
    ),
    async (req, res) =>
      res.json({ items: await pickup.list(req.validated.producerId) }),
  );
  router.post(
    '/pickup-slots',
    authenticated,
    requireRole('producer'),
    validate(slotSchema),
    async (req, res) =>
      res.status(201).json(await pickup.create(req.user, req.validated)),
  );
  return router;
}
