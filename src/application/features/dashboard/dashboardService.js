import { dashboardPeriod } from '../../../domain/features/dashboard/dashboardPeriod.js';

export function createDashboardService({ dashboard }) {
  return {
    async read(producerId, query) {
      const period = dashboardPeriod(query);
      return { period, ...(await dashboard.summarize(producerId, period)) };
    },
  };
}
