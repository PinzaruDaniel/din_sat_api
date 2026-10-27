import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';
import {
  demoProducts,
  demoProducers,
} from '../../features/catalog/demoProducts.js';

// Development adapter only. Replace these ports with the external database adapters.
export function createDemoDatabase() {
  const state = {
    users: [],
    products: structuredClone(demoProducts),
    producers: structuredClone(demoProducers),
    orders: [],
    requests: [],
    slots: [],
  };
  for (const producer of state.producers) {
    for (let day = 1; day <= 3; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      date.setUTCHours(10, 0, 0, 0);
      state.slots.push({
        id: `${producer.id}-slot-${day}`,
        producerId: producer.id,
        startsAt: date.toISOString(),
        endsAt: new Date(date.getTime() + 7200000).toISOString(),
        timeZone: 'Europe/Chisinau',
        location: `Piața locală, ${producer.locality}`,
        capacity: 10,
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
  const catalog = {
    async all() {
      return state.products.map((product) => ({
        ...product,
        producer: state.producers.find(
          (producer) => producer.id === product.producerId,
        ),
      }));
    },
    async find(id) {
      return (await this.all()).find((product) => product.id === id);
    },
    async create(input) {
      return exclusive(async () => {
        const product = { id: randomUUID(), ...input };
        state.products.push(product);
        return this.find(product.id);
      });
    },
    async producers() {
      return structuredClone(state.producers);
    },
  };
  const pickup = {
    async list(producerId) {
      return structuredClone(
        state.slots.filter(
          (slot) =>
            slot.producerId === producerId &&
            slot.capacity > 0 &&
            new Date(slot.startsAt) > new Date(),
        ),
      );
    },
    async create(input) {
      return exclusive(() => {
        const slot = { id: randomUUID(), ...input };
        state.slots.push(slot);
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
      return state.products.find((product) => product.id === id);
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
    async list(user) {
      return structuredClone(
        state.orders.filter((order) =>
          user.role === 'producer'
            ? order.producerId === user.id
            : order.buyerId === user.id,
        ),
      );
    },
  };
  return { users, catalog, pickup, orders };
}
