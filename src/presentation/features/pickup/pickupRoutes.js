import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../http/middlewares/validation.js';
import { requireRole } from '../../http/middlewares/security.js';
const id = z.string().min(1).max(80);
const location = z.string().trim().min(5).max(200);
const capacity = z.number().int().min(1).max(1000);
const pointSchema = z.object({ location }).strict();
const slotSchema = z
  .object({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: location.optional(),
    pickupPointId: id.optional(),
    capacity,
  })
  .strict()
  .refine((input) => Boolean(input.location) !== Boolean(input.pickupPointId), {
    message: 'Alege un punct existent sau introdu o adresă nouă.',
    path: ['pickupPointId'],
  })
  .refine(
    (input) => {
      const start = new Date(input.startsAt).getTime();
      const end = new Date(input.endsAt).getTime();
      const now = Date.now();
      return (
        start > now &&
        end > start &&
        end - start <= 8 * 3600000 &&
        start < now + 180 * 86400000
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
  const producerOnly = [authenticated, requireRole('producer')];
  router.get(
    '/producers/:producerId/pickup-slots',
    validate(z.object({ producerId: id }), 'params'),
    async (req, res) =>
      res.json({
        items: await pickup.list(req.validated.producerId, {
          includeFull: true,
        }),
      }),
  );
  router.get(
    '/pickup-slots',
    validate(
      z.object({ producerId: z.string().min(1).max(80) }).strict(),
      'query',
    ),
    async (req, res) =>
      res.json({ items: await pickup.list(req.validated.producerId) }),
  );
  router.get('/pickup-slots/mine', ...producerOnly, async (req, res) =>
    res.json({ items: await pickup.listOwned(req.user) }),
  );
  router.post(
    '/pickup-slots',
    ...producerOnly,
    validate(slotSchema),
    async (req, res) =>
      res.status(201).json(await pickup.create(req.user, req.validated)),
  );
  router.patch(
    '/pickup-slots/:id',
    ...producerOnly,
    validate(z.object({ capacity }).strict()),
    async (req, res) =>
      res.json(
        await pickup.updateCapacity(req.user, req.params.id, req.validated),
      ),
  );
  router.get('/pickup-points', ...producerOnly, async (req, res) =>
    res.json({ items: await pickup.listPoints(req.user) }),
  );
  router.post(
    '/pickup-points',
    ...producerOnly,
    validate(pointSchema),
    async (req, res) =>
      res.status(201).json(await pickup.createPoint(req.user, req.validated)),
  );
  router.patch(
    '/pickup-points/:id',
    ...producerOnly,
    validate(pointSchema),
    async (req, res) =>
      res.json(
        await pickup.updatePoint(req.user, req.params.id, req.validated),
      ),
  );
  return router;
}
