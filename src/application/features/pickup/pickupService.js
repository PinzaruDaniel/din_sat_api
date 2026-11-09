import { AppError } from '../../../shared/errors/AppError.js';

const timeZone = 'Europe/Chisinau';

function requireResource(resource) {
  if (!resource)
    throw new AppError(
      404,
      'PICKUP_NOT_FOUND',
      'Punctul sau intervalul nu a fost găsit pentru acest cont.',
    );
  return resource;
}

export function createPickupService({ pickup }) {
  return {
    list: (producerId, options) => pickup.list(producerId, options),
    listOwned: (user) => pickup.listOwned(user.id),
    listPoints: (user) => pickup.listPoints(user.id),
    createPoint: (user, { location }) =>
      pickup.createPoint({ producerId: user.id, location, timeZone }),
    async updatePoint(user, id, { location }) {
      return requireResource(await pickup.updatePoint(user.id, id, location));
    },
    async create(user, input) {
      return requireResource(
        await pickup.create({ ...input, producerId: user.id, timeZone }),
      );
    },
    async updateCapacity(user, id, { capacity }) {
      return requireResource(
        await pickup.updateCapacity(user.id, id, capacity),
      );
    },
  };
}
