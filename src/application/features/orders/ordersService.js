import { randomUUID, createHash } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';
import { assertOrderTransition } from '../../../domain/features/orders/orderPolicy.js';

export function createOrdersService({ orders }) {
  return {
    list: (user) => orders.list(user),
    create(user, input, key) {
      if (user.role !== 'buyer')
        throw new AppError(
          403,
          'BUYER_REQUIRED',
          'Folosește un cont de cumpărător pentru a comanda.',
        );
      const normalized = {
        items: [...input.items].sort((a, b) =>
          a.productId.localeCompare(b.productId),
        ),
        pickupSlotId: input.pickupSlotId,
      };
      const hash = createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex');
      return orders.transaction(async (tx) => {
        const previous = await tx.findRequest(user.id, key);
        if (previous) {
          if (previous.hash !== hash)
            throw new AppError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'Această cheie a fost folosită pentru altă comandă.',
            );
          return tx.findOrder(previous.orderId);
        }
        const items = [];
        for (const item of normalized.items) {
          // External persistence locks products in this stable product-ID order.
          const product = await tx.findProduct(item.productId);
          if (!product || product.availableQuantity < item.quantity) {
            throw new AppError(
              409,
              'OUT_OF_STOCK',
              'Un produs nu mai este disponibil în cantitatea aleasă.',
            );
          }
          items.push({
            productId: product.id,
            producerId: product.producerId,
            title: product.title,
            unit: product.unit,
            priceAmount: product.priceAmount,
            quantity: item.quantity,
          });
        }
        const producerId = items[0].producerId;
        if (items.some((item) => item.producerId !== producerId))
          throw new AppError(
            400,
            'SINGLE_PRODUCER_REQUIRED',
            'O comandă poate conține produse de la un singur producător.',
          );
        const slot = await tx.findSlot(input.pickupSlotId);
        if (
          !slot ||
          slot.producerId !== producerId ||
          slot.capacity < 1 ||
          new Date(slot.startsAt) <= new Date()
        ) {
          throw new AppError(
            409,
            'SLOT_UNAVAILABLE',
            'Intervalul de ridicare nu mai este disponibil.',
          );
        }
        // Integer minor units avoid floating-point money arithmetic. Quantities use whole units in v1.
        const totalMinor = items.reduce(
          (sum, item) =>
            sum + Number(item.priceAmount.replace('.', '')) * item.quantity,
          0,
        );
        const order = {
          id: randomUUID(),
          buyerId: user.id,
          producerId,
          items,
          pickup: { ...slot },
          totalAmount: (totalMinor / 100).toFixed(2),
          currency: 'MDL',
          status: 'new',
          createdAt: new Date().toISOString(),
        };
        for (const item of items)
          await tx.changeStock(item.productId, -item.quantity);
        await tx.changeCapacity(slot.id, -1);
        await tx.saveOrder(order);
        await tx.saveRequest({ userId: user.id, key, hash, orderId: order.id });
        return order;
      });
    },
    update(user, id, status) {
      return orders.transaction(async (tx) => {
        const order = await tx.findOrder(id);
        if (!order)
          throw new AppError(
            404,
            'ORDER_NOT_FOUND',
            'Comanda nu a fost găsită.',
          );
        if (
          order.status === 'cancelled' &&
          status === 'cancelled' &&
          (order.buyerId === user.id ||
            (user.role === 'producer' && order.producerId === user.id))
        )
          return order;
        assertOrderTransition(order, user, status);
        if (status === 'cancelled') {
          for (const item of [...order.items].sort((a, b) =>
            a.productId.localeCompare(b.productId),
          )) {
            await tx.changeStock(item.productId, item.quantity);
          }
          await tx.changeCapacity(order.pickup.id, 1);
        }
        await tx.saveOrder({ ...order, status });
        return { ...order, status };
      });
    },
  };
}
