import { raw, Router } from 'express';
import { z } from 'zod';
import { validate } from '../../http/middlewares/validation.js';
import { requireRole } from '../../http/middlewares/security.js';
import {
  isProductPrice,
  maxProductQuantity,
  productCategories,
  productUnits,
} from '../../../domain/features/catalog/product.js';
import { uploadedImageId } from '../../../domain/features/catalog/imageReference.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { imageTypes, maxImageBytes, validateImage } from './productImage.js';

const query = z
  .object({
    q: z.string().max(100).optional(),
    category: z.enum(productCategories).optional(),
    locality: z.string().max(80).optional(),
    producerId: z.string().min(1).max(80).optional(),
    sort: z
      .enum(['recommended', 'price-asc', 'price-desc'])
      .default('recommended'),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();

const httpsImage = z.url().refine((value) => value.startsWith('https://'));
const product = z
  .object({
    title: z.string().trim().min(3, 'Introdu cel puțin 3 caractere.').max(100),
    description: z
      .string()
      .trim()
      .min(10, 'Introdu cel puțin 10 caractere.')
      .max(2000),
    category: z.enum(productCategories),
    unit: z.enum(productUnits),
    priceAmount: z
      .string()
      .refine(isProductPrice, 'Introdu un preț pozitiv cu două zecimale.'),
    availableQuantity: z.number().int().min(0).max(maxProductQuantity),
    imageUrl: z
      .string()
      .max(2048)
      .refine(
        (value) =>
          Boolean(uploadedImageId(value)) ||
          httpsImage.safeParse(value).success,
        'Alege o imagine sau introdu o adresă HTTPS.',
      ),
  })
  .strict();

const imageBody = raw({
  type: imageTypes,
  limit: maxImageBytes,
  inflate: false,
});

function parseImage(req, res, next) {
  imageBody(req, res, (error) => {
    if (error?.status === 413)
      return next(
        new AppError(
          413,
          'IMAGE_TOO_LARGE',
          'Imaginea poate avea cel mult 2 MB.',
        ),
      );
    next(error);
  });
}

export function createCatalogRoutes({ catalog, authenticated }) {
  const router = Router();
  const producerOnly = [authenticated, requireRole('producer')];
  const publish = async (req, res) =>
    res.status(201).json(await catalog.create(req.user, req.validated));

  router.get('/products', validate(query, 'query'), async (req, res) =>
    res.json(await catalog.list(req.validated)),
  );
  router.get('/products/:id', async (req, res) =>
    res.json(await catalog.details(req.params.id)),
  );
  router.post(
    ['/products', '/producer/products'],
    producerOnly,
    validate(product),
    publish,
  );
  router.get('/producer/products', producerOnly, async (req, res) =>
    res.json({ items: await catalog.owned(req.user) }),
  );
  router.patch(
    '/producer/products/:id',
    producerOnly,
    validate(product.partial()),
    async (req, res) =>
      res.json(await catalog.update(req.user, req.params.id, req.validated)),
  );
  router.delete('/producer/products/:id', producerOnly, async (req, res) => {
    await catalog.archive(req.user, req.params.id);
    res.status(204).end();
  });
  router.post(
    '/producer/uploads',
    producerOnly,
    parseImage,
    async (req, res) => {
      const mediaType = req.is(imageTypes) || req.get('Content-Type');
      validateImage(req.body, mediaType);
      res.status(201).json(await catalog.upload(req.user, mediaType, req.body));
    },
  );
  router.get('/product-images/:id', async (req, res) => {
    const image = await catalog.image(req.params.id);
    res
      .set('Cross-Origin-Resource-Policy', 'cross-origin')
      .set('Cache-Control', 'public, max-age=31536000, immutable')
      .type(image.mediaType)
      .send(image.bytes);
  });
  return router;
}
