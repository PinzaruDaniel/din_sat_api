import { randomUUID } from 'node:crypto';
import {
  priceMinor,
  toManagedProduct,
  toPublicProduct,
} from '../../../domain/features/catalog/product.js';
import {
  imagePath,
  uploadedImageId,
} from '../../../domain/features/catalog/imageReference.js';
import { AppError } from '../../../shared/errors/AppError.js';

function requireProduct(product) {
  if (!product)
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Produsul nu a fost găsit.');
  return product;
}

export function createCatalogService({ catalog, productImages }) {
  async function assertImageOwner(producerId, imageUrl) {
    const imageId = uploadedImageId(imageUrl);
    if (imageId && !(await productImages.owns(imageId, producerId)))
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Imaginea selectată nu este disponibilă.',
        { imageUrl: 'Încarcă o imagine din contul tău.' },
      );
  }

  return {
    async list({
      q = '',
      category,
      locality,
      producerId,
      inStock = false,
      sort = 'recommended',
      page = 1,
      pageSize = 12,
    }) {
      const term = q.trim().toLocaleLowerCase('ro');
      const items = (await catalog.all()).filter(
        (product) =>
          (!inStock || product.availableQuantity > 0) &&
          (!category || product.category === category) &&
          (!producerId || product.producerId === producerId) &&
          (!locality || product.producer.locality === locality) &&
          `${product.title} ${product.producer.name}`
            .toLocaleLowerCase('ro')
            .includes(term),
      );
      if (sort === 'price-asc')
        items.sort(
          (a, b) => priceMinor(a.priceAmount) - priceMinor(b.priceAmount),
        );
      if (sort === 'price-desc')
        items.sort(
          (a, b) => priceMinor(b.priceAmount) - priceMinor(a.priceAmount),
        );
      return {
        items: items
          .slice((page - 1) * pageSize, page * pageSize)
          .map(toPublicProduct),
        total: items.length,
        page,
        pageSize,
      };
    },
    async details(id) {
      return toPublicProduct(requireProduct(await catalog.find(id)));
    },
    async owned(user) {
      return (await catalog.owned(user.id)).map(toManagedProduct);
    },
    async create(user, input) {
      await assertImageOwner(user.id, input.imageUrl);
      return toPublicProduct(
        await catalog.create({
          ...input,
          producerId: user.id,
          currency: 'MDL',
        }),
      );
    },
    async update(user, id, input) {
      await assertImageOwner(user.id, input.imageUrl);
      return toManagedProduct(
        requireProduct(await catalog.update(id, user.id, input)),
      );
    },
    async archive(user, id) {
      requireProduct(await catalog.archive(id, user.id));
    },
    async upload(user, mediaType, bytes) {
      const id = randomUUID();
      await productImages.save({ id, producerId: user.id, mediaType, bytes });
      return { imageUrl: imagePath + id };
    },
    async image(id) {
      const safeId = uploadedImageId(imagePath + id);
      const image = safeId && (await productImages.find(safeId));
      if (!image)
        throw new AppError(
          404,
          'IMAGE_NOT_FOUND',
          'Imaginea nu a fost găsită.',
        );
      return image;
    },
  };
}
