import { randomUUID } from 'node:crypto';

export const slotFromRow = (row) =>
  row && {
    id: row.id,
    producerId: row.producer_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    timeZone: row.time_zone,
    location: row.location,
    capacity: row.capacity,
  };

export function createPostgresPickup(pool) {
  return {
    async list(producerId) {
      return (
        await pool.query(
          `SELECT * FROM pickup_slots
        WHERE producer_id = $1 AND capacity > 0 AND starts_at > now()
        ORDER BY starts_at, id`,
          [producerId],
        )
      ).rows.map(slotFromRow);
    },
    async create(input) {
      return slotFromRow(
        (
          await pool.query(
            `INSERT INTO pickup_slots
        (id, producer_id, starts_at, ends_at, time_zone, location, capacity, max_capacity)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
            [
              randomUUID(),
              input.producerId,
              input.startsAt,
              input.endsAt,
              input.timeZone,
              input.location,
              input.capacity,
            ],
          )
        ).rows[0],
      );
    },
  };
}
