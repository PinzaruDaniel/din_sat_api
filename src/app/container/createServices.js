import { createPickupService } from '../../application/features/pickup/pickupService.js';
import { createAuthService } from '../../application/features/auth/authService.js';
import { createCatalogService } from '../../application/features/catalog/catalogService.js';
import { createProducersService } from '../../application/features/producers/producersService.js';
import { createOrdersService } from '../../application/features/orders/ordersService.js';
import { createDashboardService } from '../../application/features/dashboard/dashboardService.js';
import { createAssistantService } from '../../application/features/ai/assistantService.js';
export function createServices({ repositories, passwords, gateway }) {
  const catalog = createCatalogService({
    catalog: repositories.catalog,
    productImages: repositories.productImages,
  });
  const pickup = createPickupService({ pickup: repositories.pickup });
  return {
    auth: createAuthService({ users: repositories.users, passwords }),
    catalog,
    producers: createProducersService({ producers: repositories.producers }),
    pickup,
    assistant: createAssistantService({ catalog, pickup, gateway }),
    orders: createOrdersService({ orders: repositories.orders }),
    dashboard: createDashboardService({ dashboard: repositories.dashboard }),
  };
}
