import { createPickupService } from '../../application/features/pickup/pickupService.js';
import { createAuthService } from '../../application/features/auth/authService.js';
import { createCatalogService } from '../../application/features/catalog/catalogService.js';
import { createOrdersService } from '../../application/features/orders/ordersService.js';
export function createServices({ repositories, passwords }) {
  return {
    auth: createAuthService({ users: repositories.users, passwords }),
    catalog: createCatalogService({ catalog: repositories.catalog }),
    pickup: createPickupService({ pickup: repositories.pickup }),
    orders: createOrdersService({ orders: repositories.orders }),
  };
}
