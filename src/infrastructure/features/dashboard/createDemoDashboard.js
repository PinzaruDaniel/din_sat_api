import {
  activeOrderStatuses,
  dashboardDate,
  popularProductLimit,
} from '../../../domain/features/dashboard/dashboardPeriod.js';

export function createDemoDashboard(readOrders) {
  return {
    async summarize(producerId, { from, to }) {
      const scoped = (await readOrders(producerId))
        .filter((order) => {
          const date = dashboardDate(new Date(order.createdAt));
          return from <= date && date <= to;
        })
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1),
        );

      const totals = new Map();
      const popularity = new Map();
      let activeCount = 0;
      let completedCount = 0;
      let cancelledCount = 0;
      for (const order of scoped) {
        if (activeOrderStatuses.includes(order.status)) activeCount++;
        if (order.status === 'cancelled') cancelledCount++;
        if (order.status !== 'completed') continue;
        completedCount++;
        const minor = BigInt(order.totalAmount.replace('.', ''));
        totals.set(order.currency, (totals.get(order.currency) ?? 0n) + minor);
        for (const { productId, title } of order.items) {
          const product = popularity.get(productId) ?? {
            productId,
            title,
            orderCount: 0,
          };
          product.orderCount++;
          popularity.set(productId, product);
        }
      }
      if (!totals.size) totals.set('MDL', 0n);
      return {
        orderCount: scoped.length,
        activeCount,
        completedCount,
        cancelledCount,
        completedAmounts: [...totals.keys()].sort().map((currency) => {
          const digits = totals.get(currency).toString().padStart(3, '0');
          return {
            currency,
            amount: `${digits.slice(0, -2)}.${digits.slice(-2)}`,
          };
        }),
        popularProducts: [...popularity.values()]
          .sort(
            (a, b) =>
              b.orderCount - a.orderCount ||
              (a.productId < b.productId ? -1 : 1),
          )
          .slice(0, popularProductLimit),
      };
    },
  };
}
