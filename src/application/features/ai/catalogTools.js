import { z } from 'zod';
import { productCategories } from '../../../domain/features/catalog/product.js';
import { AppError } from '../../../shared/errors/AppError.js';

const id = z.string().min(1).max(80);
const tools = {
  search_products: {
    description:
      'Caută produse disponibile. Poți folosi denumirea în română sau categoria.',
    schema: z.strictObject({
      q: z.string().trim().min(1).max(100).optional(),
      category: z.enum(productCategories).optional(),
      locality: z.string().trim().min(1).max(80).optional(),
    }),
  },
  product_details: {
    description: 'Citește un produs disponibil după un ID cunoscut.',
    schema: z.strictObject({ productId: id }),
  },
  pickup_options: {
    description:
      'Citește opțiunile disponibile pentru un producător găsit în catalog.',
    schema: z.strictObject({ producerId: id }),
  },
};

export const catalogToolDefinitions = Object.entries(tools).map(
  ([name, { description, schema }]) => ({
    type: 'function',
    function: { name, description, parameters: z.toJSONSchema(schema) },
  }),
);

function productData(product) {
  return {
    id: product.id,
    producerId: product.producerId,
    title: product.title,
    unit: product.unit,
    priceAmount: product.priceAmount,
    currency: product.currency,
    availableQuantity: product.availableQuantity,
  };
}

export function createCatalogTools({ catalog, pickup }) {
  return async function runTool(name, argumentsJson) {
    if (
      !Object.hasOwn(tools, name) ||
      typeof argumentsJson !== 'string' ||
      argumentsJson.length > 1024
    )
      return { error: 'INVALID_ARGUMENTS' };
    let input;
    try {
      input = tools[name].schema.parse(JSON.parse(argumentsJson));
    } catch {
      return { error: 'INVALID_ARGUMENTS' };
    }
    if (name === 'search_products') {
      const { items } = await catalog.list({
        ...input,
        inStock: true,
        pageSize: 12,
      });
      return {
        products: items
          .filter((product) => product.availableQuantity > 0)
          .map(productData),
      };
    }
    if (name === 'pickup_options') {
      const slots = await pickup.list(input.producerId);
      return {
        slots: slots
          .filter(
            (slot) =>
              slot.capacity > 0 && Date.parse(slot.startsAt) > Date.now(),
          )
          .slice(0, 5)
          .map(({ id, startsAt, endsAt, timeZone, location }) => ({
            id,
            startsAt,
            endsAt,
            timeZone,
            location,
          })),
      };
    }
    let product;
    try {
      product = await catalog.details(input.productId);
    } catch (error) {
      if (error instanceof AppError && error.status === 404)
        return { error: 'PRODUCT_NOT_FOUND' };
      throw error;
    }
    return product.availableQuantity > 0
      ? { products: [productData(product)] }
      : { error: 'OUT_OF_STOCK' };
  };
}
