import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../http/middlewares/validation.js';
import { requireRole } from '../../http/middlewares/security.js';
const categories = ['legume', 'fructe', 'lactate', 'oua', 'miere', 'camara'];
const query = z
  .object({
    q: z.string().max(100).optional(),
    category: z.enum(categories).optional(),
    locality: z.string().max(80).optional(),
    producerId: z.string().max(80).optional(),
    sort: z
      .enum(['recommended', 'price-asc', 'price-desc'])
      .default('recommended'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();
const product = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(2000),
    category: z.enum(categories),
    unit: z.enum(['kg', 'buc', 'l']),
    priceAmount: z
      .string()
      .regex(/^\d{1,6}\.\d{2}$/)
      .refine((value) => Number(value) > 0),
    availableQuantity: z.number().int().min(0).max(100000),
    imageUrl: z
      .url()
      .refine(
        (value) => value.startsWith('https://'),
        'Folosește o adresă HTTPS.',
      ),
  })
  .strict();
export function createCatalogRoutes({ catalog, authenticated }) {
  const router = Router();
  router.get('/products', validate(query, 'query'), async (req, res) =>
    res.json(await catalog.list(req.validated)),
  );
  router.get('/products/:id', async (req, res) =>
    res.json(await catalog.details(req.params.id)),
  );
  router.post(
    '/products',
    authenticated,
    requireRole('producer'),
    validate(product),
    async (req, res) =>
      res.status(201).json(await catalog.create(req.user, req.validated)),
  );
  router.get('/producers', async (_req, res) =>
    res.json({ items: await catalog.producers() }),
  );
  return router;
}
