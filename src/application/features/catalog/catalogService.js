import {
  toPublicProduct,
  toPublicProducer,
} from '../../../domain/features/catalog/product.js';
import { AppError } from '../../../shared/errors/AppError.js';
export function createCatalogService({ catalog }) {
  return {
    async list({
      q = '',
      category,
      locality,
      producerId,
      sort = 'recommended',
      page = 1,
      pageSize = 12,
    }) {
      const term = q.toLocaleLowerCase('ro');
      let items = (await catalog.all()).filter(
        (product) =>
          (!category || product.category === category) &&
          (!producerId || product.producerId === producerId) &&
          (!locality || product.producer.locality === locality) &&
          `${product.title} ${product.producer.name}`
            .toLocaleLowerCase('ro')
            .includes(term),
      );
      if (sort === 'price-asc')
        items.sort((a, b) => Number(a.priceAmount) - Number(b.priceAmount));
      if (sort === 'price-desc')
        items.sort((a, b) => Number(b.priceAmount) - Number(a.priceAmount));
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
      const product = await catalog.find(id);
      if (!product)
        throw new AppError(
          404,
          'PRODUCT_NOT_FOUND',
          'Produsul nu a fost găsit.',
        );
      return toPublicProduct(product);
    },
    async create(user, input) {
      return toPublicProduct(
        await catalog.create({
          ...input,
          producerId: user.id,
          currency: 'MDL',
        }),
      );
    },
    async producers() {
      return (await catalog.producers()).map(toPublicProducer);
    },
  };
}
