import { toPublicProducer } from '../../../domain/features/producers/producer.js';
import { AppError } from '../../../shared/errors/AppError.js';

function profile(producer) {
  if (!producer)
    throw new AppError(
      404,
      'PRODUCER_NOT_FOUND',
      'Producătorul nu a fost găsit.',
    );
  return toPublicProducer(producer);
}

export function createProducersService({ producers }) {
  return {
    async list() {
      return (await producers.all()).map(toPublicProducer);
    },
    async details(id) {
      return profile(await producers.find(id));
    },
    async update(user, input) {
      return profile(await producers.update(user.id, input));
    },
  };
}
