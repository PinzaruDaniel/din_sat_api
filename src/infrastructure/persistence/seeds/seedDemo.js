import {
  demoProducts,
  demoProducers,
} from '../../features/catalog/demoProducts.js';
import { createPasswords } from '../../security/passwords.js';
import { withTransaction } from '../transactions/withTransaction.js';

// Explicit development command only. Re-running never resets inventory or orders.
export async function seedDemo(pool, { now = new Date() } = {}) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seed is disabled in production.');
  const passwords = await createPasswords();
  const hash = await passwords.hash('DinSatDemo2026!');
  return withTransaction(pool, async (client) => {
    const accounts = [
      {
        id: 'buyer-demo',
        email: 'buyer@dinsat.demo',
        name: 'Ana Popescu',
        role: 'buyer',
      },
      {
        id: 'producer-demo',
        email: 'producer@dinsat.demo',
        name: 'Livada Anei',
        role: 'producer',
      },
      ...demoProducers.map((producer, index) => ({
        ...producer,
        email: `producer${index + 1}@dinsat.demo`,
        role: 'producer',
      })),
    ];
    for (const account of accounts) {
      await client.query(
        `INSERT INTO users (id, name, email, role, password_hash)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [account.id, account.name, account.email, account.role, hash],
      );
      const user = (
        await client.query('SELECT id, role FROM users WHERE email = $1', [
          account.email,
        ])
      ).rows[0];
      if (user?.id !== account.id || user.role !== account.role)
        throw new Error(
          'Demo account conflicts with existing data; seed cancelled.',
        );
      if (account.role === 'producer')
        await client.query(
          `INSERT INTO producers (id, name, locality, description)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [
            account.id,
            account.name,
            account.locality ?? 'Moldova',
            account.description ?? 'Producător local DinSat.',
          ],
        );
    }
    for (const product of demoProducts)
      await client.query(
        `INSERT INTO products
        (id, producer_id, title, description, category, unit, price_amount, currency, available_quantity, image_url, badge)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [
          product.id,
          product.producerId,
          product.title,
          product.description,
          product.category,
          product.unit,
          product.priceAmount,
          product.currency,
          product.availableQuantity,
          product.imageUrl,
          product.badge,
        ],
      );
    let pickupSlotsInserted = 0;
    for (const producer of demoProducers)
      for (let day = 1; day <= 3; day++) {
        const start = new Date(now);
        start.setUTCDate(start.getUTCDate() + day);
        start.setUTCHours(10, 0, 0, 0);
        const date = start.toISOString().slice(0, 10);
        const result = await client.query(
          `INSERT INTO pickup_slots
          (id, producer_id, starts_at, ends_at, time_zone, location, capacity, max_capacity)
          VALUES ($1,$2,$3,$4,$5,$6,10,10) ON CONFLICT DO NOTHING`,
          [
            `${producer.id}-slot-${date}`,
            producer.id,
            start,
            new Date(start.getTime() + 7200000),
            'Europe/Chisinau',
            `Piața locală, ${producer.locality}`,
          ],
        );
        pickupSlotsInserted += result.rowCount;
      }
    return {
      accounts: accounts.length,
      products: demoProducts.length,
      pickupSlotsConsidered: demoProducers.length * 3,
      pickupSlotsInserted,
    };
  });
}
