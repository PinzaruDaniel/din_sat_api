export function toPublicProducer(producer) {
  return {
    id: producer.id,
    name: producer.name,
    locality: producer.locality,
    description: producer.description,
  };
}
