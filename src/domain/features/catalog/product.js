import { toPublicProducer } from '../producers/producer.js';

export const productCategories = [
  'legume',
  'fructe',
  'lactate',
  'oua',
  'miere',
  'camara',
];
export const productUnits = ['kg', 'buc', 'l'];
export const productPricePattern = /^\d{1,6}\.\d{2}$/;
export const maxProductQuantity = 100000;

export function priceMinor(value) {
  return Number(value.replace('.', ''));
}

export function isProductPrice(value) {
  return productPricePattern.test(value) && priceMinor(value) > 0;
}

export function toPublicProduct(product) {
  return {
    id: product.id,
    producerId: product.producerId,
    title: product.title,
    description: product.description,
    category: product.category,
    unit: product.unit,
    priceAmount: product.priceAmount,
    currency: product.currency,
    availableQuantity: product.availableQuantity,
    imageUrl: product.imageUrl,
    badge: product.badge,
    producer: toPublicProducer(product.producer),
  };
}

export function toManagedProduct(product) {
  return { ...toPublicProduct(product), active: product.active !== false };
}
