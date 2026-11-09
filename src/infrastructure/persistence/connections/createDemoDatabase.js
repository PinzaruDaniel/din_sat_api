import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';
import { createDemoDashboard } from '../../features/dashboard/createDemoDashboard.js';
import {
  demoProducts,
  demoProducers,
} from '../../features/catalog/demoProducts.js';

// Development adapter only. Replace these ports with the external database adapters.
export function createDemoDatabase() {
  const images = new Map();
  const state = {
    users: [],
    products: structuredClone(demoProducts),
    producers: structuredClone(demoProducers),
    orders: [],
    requests: [],
    slots: [],
    pickupPoints: [],
  };
  for (const producer of state.producers) {
    const point = {
      id: `${producer.id}-point`,
      producerId: producer.id,
      timeZone: 'Europe/Chisinau',
      location: `Piața locală, ${producer.locality}`,
    };
    state.pickupPoints.push(point);
    for (let day = 1; day <= 3; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      date.setUTCHours(10, 0, 0, 0);
      state.slots.push({
        id: `${producer.id}-slot-${day}`,
        producerId: producer.id,
        pickupPointId: point.id,
        startsAt: date.toISOString(),
        endsAt: new Date(date.getTime() + 7200000).toISOString(),
        timeZone: point.timeZone,
        location: point.location,
        capacity: 10,
        maxCapacity: 10,
      });
    }
  }
  let queue = Promise.resolve();
  async function exclusive(work) {
    const previous = queue;
    let release;
    queue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }
  const users = {
    async findByEmail(email) {
      return state.users.find((user) => user.email === email);
    },
    async findById(id) {
      return state.users.find((user) => user.id === id);
    },
    async create(input) {
      // This check and insert are synchronous; a DB adapter must enforce UNIQUE(email).
      if (state.users.some((user) => user.email === input.email))
        throw new AppError(
          409,
          'EMAIL_EXISTS',
          'Există deja un cont cu acest email.',
        );
      const user = { id: randomUUID(), ...input };
      state.users.push(user);
      if (user.role === 'producer')
        state.producers.push({
          id: user.id,
          name: user.name,
          locality: 'Moldova',
          description: 'Producător local DinSat.',
        });
      return user;
    },
  };
  function productWithProducer(product) {
    return structuredClone({
      ...product,
      producer: state.producers.find(
        (producer) => producer.id === product.producerId,
      ),
    });
  }
  const catalog = {
    async all() {
      return state.products
        .filter((product) => product.active !== false)
        .map(productWithProducer);
    },
    async find(id) {
      return (await this.all()).find((product) => product.id === id);
    },
    async create(input) {
      return exclusive(async () => {
        const product = { id: randomUUID(), active: true, ...input };
        state.products.push(product);
        return productWithProducer(product);
      });
    },
    async owned(producerId) {
      return state.products
        .filter((product) => product.producerId === producerId)
        .sort((a, b) => Number(b.active !== false) - Number(a.active !== false))
        .map(productWithProducer);
    },
    async update(id, producerId, input) {
      return exclusive(() => {
        const product = state.products.find(
          (item) =>
            item.id === id &&
            item.producerId === producerId &&
            item.active !== false,
        );
        if (!product) return undefined;
        Object.assign(product, input);
        return productWithProducer(product);
      });
    },
    async archive(id, producerId) {
      return exclusive(() => {
        const product = state.products.find(
          (item) => item.id === id && item.producerId === producerId,
        );
        if (!product) return false;
        product.active = false;
        return true;
      });
    },
  };
  const productImages = {
    async save(image) {
      images.set(image.id, image);
    },
    async owns(id, producerId) {
      return images.get(id)?.producerId === producerId;
    },
    async find(id) {
      return images.get(id);
    },
  };
  const producers = {
    async all() {
      return structuredClone(state.producers);
    },
    async find(id) {
      return structuredClone(
        state.producers.find((producer) => producer.id === id),
      );
    },
    async update(id, input) {
      return exclusive(() => {
        const producer = state.producers.find((entry) => entry.id === id);
        if (!producer) return undefined;
        Object.assign(producer, input);
        return structuredClone(producer);
      });
    },
  };
  function findOrCreatePickupPoint({ producerId, location, timeZone }) {
    const existing = state.pickupPoints.find(
      (point) =>
        point.producerId === producerId &&
        point.location === location &&
        point.timeZone === timeZone,
    );
    if (existing) return existing;
    const point = { id: randomUUID(), producerId, location, timeZone };
    state.pickupPoints.push(point);
    return point;
  }
  const pickup = {
    async list(producerId, { includeFull = false } = {}) {
      return structuredClone(
        state.slots
          .filter(
            (slot) =>
              slot.producerId === producerId &&
              (includeFull || slot.capacity > 0) &&
              new Date(slot.startsAt) > new Date(),
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
    },
    async listOwned(producerId) {
      return structuredClone(
        state.slots
          .filter((slot) => slot.producerId === producerId)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
    },
    async listPoints(producerId) {
      return structuredClone(
        state.pickupPoints
          .filter((point) => point.producerId === producerId)
          .sort((a, b) => a.location.localeCompare(b.location)),
      );
    },
    createPoint(input) {
      return exclusive(() => structuredClone(findOrCreatePickupPoint(input)));
    },
    updatePoint(producerId, id, location) {
      return exclusive(() => {
        const point = state.pickupPoints.find(
          (point) => point.id === id && point.producerId === producerId,
        );
        if (!point) return undefined;
        if (
          state.pickupPoints.some(
            (other) =>
              other.id !== id &&
              other.producerId === producerId &&
              other.location === location &&
              other.timeZone === point.timeZone,
          )
        )
          throw new AppError(
            409,
            'PICKUP_POINT_EXISTS',
            'Există deja un punct la această adresă.',
          );
        point.location = location;
        return structuredClone(point);
      });
    },
    async create(input) {
      return exclusive(() => {
        const { producerId, pickupPointId, startsAt, endsAt, capacity } = input;
        const point = pickupPointId
          ? state.pickupPoints.find(
              (point) =>
                point.id === pickupPointId && point.producerId === producerId,
            )
          : findOrCreatePickupPoint(input);
        if (!point) return undefined;
        const slot = {
          id: randomUUID(),
          producerId,
          startsAt,
          endsAt,
          capacity,
          pickupPointId: point.id,
          timeZone: point.timeZone,
          location: point.location,
        };
        const created = { ...slot, maxCapacity: capacity };
        state.slots.push(created);
        return structuredClone(created);
      });
    },
    updateCapacity(producerId, id, maxCapacity) {
      return exclusive(() => {
        const slot = state.slots.find(
          (slot) => slot.id === id && slot.producerId === producerId,
        );
        if (!slot) return undefined;
        const capacity = maxCapacity - (slot.maxCapacity - slot.capacity);
        if (new Date(slot.startsAt) <= new Date() || capacity < 0)
          throw new AppError(
            409,
            'PICKUP_CAPACITY_CONFLICT',
            'Intervalul a început sau capacitatea este sub numărul de rezervări existente.',
          );
        Object.assign(slot, { capacity, maxCapacity });
        return structuredClone(slot);
      });
    },
  };
  // Serialize demo transactions. External adapters use a real DB transaction and
  // locked rows instead; services receive the same small transaction port.
  const transaction = {
    async findRequest(userId, key) {
      return state.requests.find(
        (entry) => entry.userId === userId && entry.key === key,
      );
    },
    async findOrder(id) {
      return state.orders.find((order) => order.id === id);
    },
    async findProduct(id) {
      return state.products.find(
        (product) => product.id === id && product.active !== false,
      );
    },
    async findSlot(id) {
      return state.slots.find((slot) => slot.id === id);
    },
    async changeStock(id, difference) {
      state.products.find((product) => product.id === id).availableQuantity +=
        difference;
    },
    async changeCapacity(id, difference) {
      state.slots.find((slot) => slot.id === id).capacity += difference;
    },
    async saveOrder(order) {
      const index = state.orders.findIndex((entry) => entry.id === order.id);
      if (index < 0) state.orders.push(order);
      else state.orders[index] = order;
      return order;
    },
    async saveRequest(entry) {
      state.requests.push(entry);
    },
  };
  const orders = {
    async transaction(work) {
      return exclusive(async () => {
        const snapshot = structuredClone({
          products: state.products,
          orders: state.orders,
          requests: state.requests,
          slots: state.slots,
        });
        try {
          return structuredClone(await work(transaction));
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      });
    },
    async get(user, id) {
      return (await this.list(user)).find((order) => order.id === id);
    },
    async list(user, { limit, offset = 0, pickupSlotId } = {}) {
      return structuredClone(
        state.orders
          .filter(
            (order) =>
              (!pickupSlotId || order.pickup.id === pickupSlotId) &&
              (user.role === 'producer'
                ? order.producerId === user.id
                : order.buyerId === user.id),
          )
          .sort(
            (a, b) =>
              b.createdAt.localeCompare(a.createdAt) ||
              a.id.localeCompare(b.id),
          )
          .slice(offset, limit === undefined ? undefined : offset + limit),
      );
    },
  };
  const dashboard = createDemoDashboard((producerId) =>
    exclusive(() =>
      structuredClone(
        state.orders.filter((order) => order.producerId === producerId),
      ),
    ),
  );
  return {
    users,
    catalog,
    productImages,
    producers,
    pickup,
    orders,
    dashboard,
  };
}
