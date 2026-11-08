CREATE TABLE users (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  role text NOT NULL CHECK (role IN ('buyer', 'producer')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE producers (
  id text PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  locality text NOT NULL DEFAULT 'Moldova',
  description text NOT NULL DEFAULT 'Producător local DinSat.'
);

CREATE TABLE products (
  id text PRIMARY KEY,
  producer_id text NOT NULL REFERENCES producers(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('legume', 'fructe', 'lactate', 'oua', 'miere', 'camara')),
  unit text NOT NULL CHECK (unit IN ('kg', 'buc', 'l')),
  price_amount numeric(8,2) NOT NULL CHECK (price_amount > 0),
  currency text NOT NULL DEFAULT 'MDL' CHECK (currency = 'MDL'),
  available_quantity integer NOT NULL CHECK (available_quantity >= 0),
  image_url text NOT NULL CHECK (image_url LIKE 'https://%'),
  badge text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_producer_idx ON products(producer_id);
CREATE INDEX products_active_category_idx ON products(category) WHERE active;

CREATE TABLE pickup_slots (
  id text PRIMARY KEY,
  producer_id text NOT NULL REFERENCES producers(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  time_zone text NOT NULL,
  location text NOT NULL,
  capacity integer NOT NULL CHECK (capacity >= 0),
  max_capacity integer NOT NULL CHECK (max_capacity > 0 AND capacity <= max_capacity),
  UNIQUE (id, producer_id)
);
CREATE INDEX pickup_slots_producer_start_idx ON pickup_slots(producer_id, starts_at);

CREATE TABLE orders (
  id text PRIMARY KEY,
  buyer_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  producer_id text NOT NULL REFERENCES producers(id) ON DELETE RESTRICT,
  pickup_slot_id text NOT NULL,
  pickup_snapshot jsonb NOT NULL CHECK (jsonb_typeof(pickup_snapshot) = 'object'),
  total_amount numeric(16,2) NOT NULL CHECK (total_amount >= 0),
  currency text NOT NULL CHECK (currency = 'MDL'),
  status text NOT NULL CHECK (status IN ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (pickup_slot_id, producer_id) REFERENCES pickup_slots(id, producer_id),
  UNIQUE (id, buyer_id)
);
CREATE INDEX orders_buyer_created_idx ON orders(buyer_id, created_at DESC);
CREATE INDEX orders_producer_created_idx ON orders(producer_id, created_at DESC);

CREATE TABLE order_items (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  producer_id text NOT NULL REFERENCES producers(id) ON DELETE RESTRICT,
  title text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('kg', 'buc', 'l')),
  price_amount numeric(8,2) NOT NULL CHECK (price_amount > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, position),
  UNIQUE (order_id, product_id)
);

CREATE TABLE idempotency_requests (
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  order_id text NOT NULL,
  PRIMARY KEY (user_id, operation, key),
  FOREIGN KEY (order_id, user_id) REFERENCES orders(id, buyer_id)
);

-- connect-pg-simple's documented table contract; migrations own its lifecycle.
CREATE TABLE sessions (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX sessions_expire_idx ON sessions(expire);
