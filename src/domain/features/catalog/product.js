export function toPublicProducer(producer) {
  return {
    id: producer.id,
    name: producer.name,
    locality: producer.locality,
    description: producer.description,
  };
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
