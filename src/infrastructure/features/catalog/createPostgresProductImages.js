export function createPostgresProductImages(pool) {
  return {
    async save({ id, producerId, mediaType, bytes }) {
      await pool.query(
        'INSERT INTO product_images (id, producer_id, media_type, bytes) VALUES ($1,$2,$3,$4)',
        [id, producerId, mediaType, bytes],
      );
    },
    async owns(id, producerId) {
      const result = await pool.query(
        'SELECT 1 FROM product_images WHERE id = $1 AND producer_id = $2',
        [id, producerId],
      );
      return result.rowCount > 0;
    },
    async find(id) {
      const result = await pool.query(
        'SELECT media_type AS "mediaType", bytes FROM product_images WHERE id = $1',
        [id],
      );
      return result.rows[0];
    },
  };
}
