export function createPostgresProducers(pool) {
  return {
    async all() {
      return (
        await pool.query(
          'SELECT id, name, locality, description FROM producers ORDER BY id',
        )
      ).rows;
    },
    async find(id) {
      return (
        await pool.query(
          'SELECT id, name, locality, description FROM producers WHERE id = $1',
          [id],
        )
      ).rows[0];
    },
    async update(id, input) {
      return (
        await pool.query(
          `UPDATE producers SET name = $2, locality = $3, description = $4
        WHERE id = $1 RETURNING id, name, locality, description`,
          [id, input.name, input.locality, input.description],
        )
      ).rows[0];
    },
  };
}
