import { createPostgresUsers } from '../../features/auth/createPostgresUsers.js';
import { createPostgresCatalog } from '../../features/catalog/createPostgresCatalog.js';
import { createPostgresProductImages } from '../../features/catalog/createPostgresProductImages.js';
import { createPostgresProducers } from '../../features/producers/createPostgresProducers.js';
import { createPostgresPickup } from '../../features/pickup/createPostgresPickup.js';
import { createPostgresOrders } from '../../features/orders/createPostgresOrders.js';
import { createPostgresDashboard } from '../../features/dashboard/createPostgresDashboard.js';

export function createPostgresDatabase({ pool }) {
  return {
    users: createPostgresUsers(pool),
    catalog: createPostgresCatalog(pool),
    productImages: createPostgresProductImages(pool),
    producers: createPostgresProducers(pool),
    pickup: createPostgresPickup(pool),
    orders: createPostgresOrders(pool),
    dashboard: createPostgresDashboard(pool),
  };
}
