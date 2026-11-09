import {
  activeOrderStatuses,
  popularProductLimit,
} from '../../../domain/features/dashboard/dashboardPeriod.js';

export function createPostgresDashboard(pool) {
  return {
    async summarize(producerId, { from, to, timeZone }) {
      const { rows } = await pool.query(
        `WITH scoped AS (
           SELECT id, status, currency, total_amount, created_at
           FROM orders
           WHERE producer_id = $1
             AND created_at >= ($2::date::timestamp AT TIME ZONE $4::text)
             AND created_at < (($3::date + 1)::timestamp AT TIME ZONE $4::text)
         ), currency_totals AS (
           SELECT currency, SUM(total_amount)::text AS amount
           FROM scoped WHERE status = 'completed' GROUP BY currency
         ), products_by_orders AS (
           SELECT DISTINCT ON (i.product_id) i.product_id, i.title,
             COUNT(*) OVER (PARTITION BY i.product_id) AS order_count
           FROM scoped o JOIN order_items i ON i.order_id = o.id
           WHERE o.status = 'completed'
           ORDER BY i.product_id, o.created_at DESC, o.id COLLATE "C" DESC
         ), popular AS (
           SELECT product_id, title, order_count FROM products_by_orders
           ORDER BY order_count DESC, product_id COLLATE "C"
           LIMIT $6
         )
         SELECT COUNT(*) AS order_count,
           COUNT(*) FILTER (WHERE status = ANY($5::text[])) AS active_count,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
           COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
           COALESCE((SELECT json_agg(currency_totals ORDER BY currency)
                     FROM currency_totals), '[{"currency":"MDL","amount":"0.00"}]') AS completed_amounts,
           COALESCE((SELECT json_agg(json_build_object(
             'productId', product_id, 'title', title, 'orderCount', order_count)
             ORDER BY order_count DESC, product_id COLLATE "C") FROM popular), '[]') AS popular_products
         FROM scoped`,
        [
          producerId,
          from,
          to,
          timeZone,
          activeOrderStatuses,
          popularProductLimit,
        ],
      );
      const result = rows[0];
      return {
        orderCount: Number(result.order_count),
        activeCount: Number(result.active_count),
        completedCount: Number(result.completed_count),
        cancelledCount: Number(result.cancelled_count),
        completedAmounts: result.completed_amounts,
        popularProducts: result.popular_products,
      };
    },
  };
}
