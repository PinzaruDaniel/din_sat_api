import { createPostgresUsers } from '../../features/auth/createPostgresUsers.js';
import { createPostgresCatalog } from '../../features/catalog/createPostgresCatalog.js';
import { createPostgresPickup } from '../../features/pickup/createPostgresPickup.js';
import { createPostgresOrders } from '../../features/orders/createPostgresOrders.js';

export function createPostgresDatabase({ pool }) {
  return {
    users: createPostgresUsers(pool),
    catalog: createPostgresCatalog(pool),
    pickup: createPostgresPickup(pool),
    orders: createPostgresOrders(pool),
  };
}
