import { withTransaction } from '../../persistence/transactions/withTransaction.js';
import { productFromRow } from '../catalog/createPostgresCatalog.js';
import { slotFromRow } from '../pickup/createPostgresPickup.js';

async function orderFromRow(client, row) {
  if (!row) return undefined;
  const items = (
    await client.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY position',
      [row.id],
    )
  ).rows;
  return {
    id: row.id,
    buyerId: row.buyer_id,
    producerId: row.producer_id,
    items: items.map((item) => ({
      productId: item.product_id,
      producerId: item.producer_id,
      title: item.title,
      unit: item.unit,
      priceAmount: item.price_amount,
      quantity: item.quantity,
    })),
    pickup: row.pickup_snapshot,
    totalAmount: row.total_amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

function createTransaction(client) {
  return {
    async findRequest(userId, key) {
      // A missing row cannot be locked with FOR UPDATE. This transaction-scoped
      // key lock serializes the first two requests as well as subsequent retries.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [JSON.stringify([userId, 'checkout', key])],
      );
      const row = (
        await client.query(
          `SELECT * FROM idempotency_requests
        WHERE user_id = $1 AND operation = 'checkout' AND key = $2`,
          [userId, key],
        )
      ).rows[0];
      return (
        row && {
          userId: row.user_id,
          key: row.key,
          hash: row.request_hash,
          orderId: row.order_id,
        }
      );
    },
    async findOrder(id) {
      return orderFromRow(
        client,
        (
          await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [
            id,
          ])
        ).rows[0],
      );
    },
    async findProduct(id) {
      return productFromRow(
        (
          await client.query(
            'SELECT * FROM products WHERE id = $1 AND active FOR UPDATE',
            [id],
          )
        ).rows[0],
      );
    },
    async findSlot(id) {
      return slotFromRow(
        (
          await client.query(
            'SELECT * FROM pickup_slots WHERE id = $1 FOR UPDATE',
            [id],
          )
        ).rows[0],
      );
    },
    async changeStock(id, difference) {
      await client.query(
        'UPDATE products SET available_quantity = available_quantity + $2 WHERE id = $1',
        [id, difference],
      );
    },
    async changeCapacity(id, difference) {
      await client.query(
        'UPDATE pickup_slots SET capacity = capacity + $2 WHERE id = $1',
        [id, difference],
      );
    },
    async saveOrder(order) {
      await client.query(
        `INSERT INTO orders
        (id, buyer_id, producer_id, pickup_slot_id, pickup_snapshot, total_amount, currency, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [
          order.id,
          order.buyerId,
          order.producerId,
          order.pickup.id,
          JSON.stringify(order.pickup),
          order.totalAmount,
          order.currency,
          order.status,
          order.createdAt,
        ],
      );
      for (const [position, item] of order.items.entries())
        await client.query(
          `INSERT INTO order_items
          (order_id, position, product_id, producer_id, title, unit, price_amount, quantity)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (order_id, position) DO NOTHING`,
          [
            order.id,
            position,
            item.productId,
            item.producerId,
            item.title,
            item.unit,
            item.priceAmount,
            item.quantity,
          ],
        );
      return order;
    },
    async saveRequest(entry) {
      await client.query(
        `INSERT INTO idempotency_requests
        (user_id, operation, key, request_hash, order_id) VALUES ($1,'checkout',$2,$3,$4)`,
        [entry.userId, entry.key, entry.hash, entry.orderId],
      );
    },
  };
}

export function createPostgresOrders(pool) {
  return {
    transaction: (work) =>
      withTransaction(pool, (client) => work(createTransaction(client))),
    async list(user) {
      const column = user.role === 'producer' ? 'producer_id' : 'buyer_id';
      return withTransaction(pool, async (client) => {
        const rows = (
          await client.query(
            `SELECT * FROM orders WHERE ${column} = $1 ORDER BY created_at DESC, id`,
            [user.id],
          )
        ).rows;
        return Promise.all(rows.map((row) => orderFromRow(client, row)));
      });
    },
  };
}
