CREATE TABLE product_images (
  id uuid PRIMARY KEY,
  producer_id text NOT NULL REFERENCES producers(id) ON DELETE RESTRICT,
  media_type text NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152)
);

ALTER TABLE products DROP CONSTRAINT products_image_url_check;
ALTER TABLE products ADD CONSTRAINT products_image_url_check CHECK (
  image_url LIKE 'https://%' OR
  image_url ~ '^/api/v1/product-images/[0-9a-f-]{36}$'
);
