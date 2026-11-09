import { randomUUID } from 'node:crypto';

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
    active: row.active,
    badge: row.badge ?? undefined,
    ...(row.producer && { producer: row.producer }),
  };

const select = (table) => `SELECT p.*, jsonb_build_object(
  'id', r.id, 'name', r.name, 'locality', r.locality, 'description', r.description
) AS producer FROM ${table} p JOIN producers r ON r.id = p.producer_id`;

function productFields(input) {
  return [
    input.title,
    input.description,
    input.category,
    input.unit,
    input.priceAmount,
    input.availableQuantity,
    input.imageUrl,
  ];
}

export function createPostgresCatalog(pool) {
  return {
    async all() {
      return (
        await pool.query(
          `${select('products')} WHERE p.active ORDER BY p.created_at, p.id`,
        )
      ).rows.map(productFromRow);
    },
    async find(id) {
      return productFromRow(
        (
          await pool.query(
            `${select('products')} WHERE p.id = $1 AND p.active`,
            [id],
          )
        ).rows[0],
      );
    },
    async owned(producerId) {
      return (
        await pool.query(
          `${select('products')} WHERE p.producer_id = $1 ORDER BY p.active DESC, p.created_at, p.id`,
          [producerId],
        )
      ).rows.map(productFromRow);
    },
    async create(input) {
      return productFromRow(
        (
          await pool.query(
            `WITH created AS (
            INSERT INTO products
              (id, producer_id, currency, badge, title, description, category, unit, price_amount, available_quantity, image_url)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
          ) ${select('created')}`,
            [
              randomUUID(),
              input.producerId,
              input.currency,
              input.badge ?? null,
              ...productFields(input),
            ],
          )
        ).rows[0],
      );
    },
    async update(id, producerId, input) {
      return productFromRow(
        (
          await pool.query(
            `WITH updated AS (
            UPDATE products SET title = COALESCE($3, title), description = COALESCE($4, description),
              category = COALESCE($5, category), unit = COALESCE($6, unit),
              price_amount = COALESCE($7, price_amount), available_quantity = COALESCE($8, available_quantity),
              image_url = COALESCE($9, image_url)
            WHERE id = $1 AND producer_id = $2 AND active RETURNING *
          ) ${select('updated')}`,
            [id, producerId, ...productFields(input)],
          )
        ).rows[0],
      );
    },
    async archive(id, producerId) {
      const result = await pool.query(
        'UPDATE products SET active = false WHERE id = $1 AND producer_id = $2',
        [id, producerId],
      );
      return result.rowCount > 0;
    },
  };
}
