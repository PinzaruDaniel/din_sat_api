import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../http/middlewares/validation.js';
const input = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(80),
            quantity: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(50)
      .refine(
        (items) =>
          new Set(items.map((item) => item.productId)).size === items.length,
        'Produsele nu pot fi duplicate.',
      ),
    pickupSlotId: z.string().min(1).max(80),
  })
  .strict();
export function createOrdersRoutes({ orders, authenticated }) {
  const router = Router();
  router.use(authenticated);
  router.get('/', async (req, res) =>
    res.json({ items: await orders.list(req.user) }),
  );
  router.post('/', validate(input), validateKey, async (req, res) =>
    res
      .status(201)
      .json(
        await orders.create(
          req.user,
          req.validated,
          req.get('Idempotency-Key'),
        ),
      ),
  );
  router.patch(
    '/:id/status',
    validate(
      z
        .object({
          status: z.enum([
            'confirmed',
            'preparing',
            'ready',
            'completed',
            'cancelled',
          ]),
        })
        .strict(),
    ),
    async (req, res) =>
      res.json(
        await orders.update(req.user, req.params.id, req.validated.status),
      ),
  );
  return router;
}
function validateKey(req, res, next) {
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(req.get('Idempotency-Key') ?? ''))
    return res.status(400).json({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Cheia comenzii lipsește sau este invalidă.',
      requestId: req.requestId,
    });
  next();
}
