import { randomUUID } from 'node:crypto';

export const producerFromRow = (row) => ({
  id: row.id,
  name: row.name,
  locality: row.locality,
  description: row.description,
});
export const productFromRow = (row) =>
  row && {
    id: row.id,
    producerId: row.producer_id,
    title: row.title,
    description: row.description,
    category: row.category,
    unit: row.unit,
    priceAmount: row.price_amount,
    currency: row.currency,
    availableQuantity: row.available_quantity,
    imageUrl: row.image_url,
    badge: row.badge ?? undefined,
    ...(row.producer && { producer: row.producer }),
  };
const select = `SELECT p.*, jsonb_build_object(
  'id', r.id, 'name', r.name, 'locality', r.locality, 'description', r.description
) AS producer FROM products p JOIN producers r ON r.id = p.producer_id`;

export function createPostgresCatalog(pool) {
  return {
    async all() {
      return (
        await pool.query(`${select} WHERE p.active ORDER BY p.created_at, p.id`)
      ).rows.map(productFromRow);
    },
    async find(id) {
      return productFromRow(
        (await pool.query(`${select} WHERE p.id = $1 AND p.active`, [id]))
          .rows[0],
      );
    },
    async create(input) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO products
        (id, producer_id, title, description, category, unit, price_amount, currency, available_quantity, image_url, badge)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          input.producerId,
          input.title,
          input.description,
          input.category,
          input.unit,
          input.priceAmount,
          input.currency,
          input.availableQuantity,
          input.imageUrl,
          input.badge ?? null,
        ],
      );
      return this.find(id);
    },
    async producers() {
      return (await pool.query('SELECT * FROM producers ORDER BY id')).rows.map(
        producerFromRow,
      );
    },
  };
}
