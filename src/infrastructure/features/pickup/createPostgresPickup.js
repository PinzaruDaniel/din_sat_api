import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/errors/AppError.js';
import { withTransaction } from '../../persistence/transactions/withTransaction.js';

export const slotFromRow = (row) =>
  row && {
    id: row.id,
    producerId: row.producer_id,
    pickupPointId: row.pickup_point_id,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    timeZone: row.time_zone,
    location: row.location,
    capacity: row.capacity,
    maxCapacity: row.max_capacity,
  };

const pointFromRow = (row) =>
  row && {
    id: row.id,
    producerId: row.producer_id,
    location: row.location,
    timeZone: row.time_zone,
  };

export async function findOrCreatePickupPoint(
  client,
  { producerId, location, timeZone },
) {
  const { rows } = await client.query(
    `INSERT INTO pickup_points (id, producer_id, location, time_zone)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (producer_id, location, time_zone)
     DO UPDATE SET location = EXCLUDED.location
     RETURNING *`,
    [randomUUID(), producerId, location, timeZone],
  );
  return pointFromRow(rows[0]);
}

export function createPostgresPickup(pool) {
  return {
    async list(producerId, { includeFull = false } = {}) {
      return (
        await pool.query(
          `SELECT * FROM pickup_slots
        WHERE producer_id = $1 AND ($2 OR capacity > 0) AND starts_at > now()
        ORDER BY starts_at, id`,
          [producerId, includeFull],
        )
      ).rows.map(slotFromRow);
    },
    async listOwned(producerId) {
      const { rows } = await pool.query(
        'SELECT * FROM pickup_slots WHERE producer_id = $1 ORDER BY starts_at, id',
        [producerId],
      );
      return rows.map(slotFromRow);
    },
    async listPoints(producerId) {
      const { rows } = await pool.query(
        'SELECT * FROM pickup_points WHERE producer_id = $1 ORDER BY location, id',
        [producerId],
      );
      return rows.map(pointFromRow);
    },
    createPoint: (input) => findOrCreatePickupPoint(pool, input),
    async updatePoint(producerId, id, location) {
      try {
        const { rows } = await pool.query(
          `UPDATE pickup_points SET location = $3 WHERE id = $1 AND producer_id = $2 RETURNING *`,
          [id, producerId, location],
        );
        return pointFromRow(rows[0]);
      } catch (error) {
        if (error.code === '23505')
          throw new AppError(
            409,
            'PICKUP_POINT_EXISTS',
            'Există deja un punct la această adresă.',
          );
        throw error;
      }
    },
    create(input) {
      return withTransaction(pool, async (client) => {
        const { producerId, pickupPointId } = input;
        const point = pickupPointId
          ? pointFromRow(
              (
                await client.query(
                  'SELECT * FROM pickup_points WHERE id = $1 AND producer_id = $2 FOR SHARE',
                  [pickupPointId, producerId],
                )
              ).rows[0],
            )
          : await findOrCreatePickupPoint(client, input);
        if (!point) return undefined;
        return slotFromRow(
          (
            await client.query(
              `INSERT INTO pickup_slots
        (id, producer_id, starts_at, ends_at, time_zone, location, capacity, max_capacity, pickup_point_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING *`,
              [
                randomUUID(),
                producerId,
                input.startsAt,
                input.endsAt,
                point.timeZone,
                point.location,
                input.capacity,
                point.id,
              ],
            )
          ).rows[0],
        );
      });
    },
    updateCapacity(producerId, id, maxCapacity) {
      return withTransaction(pool, async (client) => {
        const {
          rows: [slot],
        } = await client.query(
          'SELECT * FROM pickup_slots WHERE id = $1 AND producer_id = $2 FOR UPDATE',
          [id, producerId],
        );
        if (!slot) return undefined;
        const capacity = maxCapacity - (slot.max_capacity - slot.capacity);
        if (slot.starts_at <= new Date() || capacity < 0)
          throw new AppError(
            409,
            'PICKUP_CAPACITY_CONFLICT',
            'Intervalul a început sau capacitatea este sub numărul de rezervări existente.',
          );
        const {
          rows: [updated],
        } = await client.query(
          'UPDATE pickup_slots SET max_capacity = $2, capacity = $3 WHERE id = $1 RETURNING *',
          [id, maxCapacity, capacity],
        );
        return slotFromRow(updated);
      });
    },
  };
}
