CREATE TABLE pickup_points (
  id text PRIMARY KEY,
  producer_id text NOT NULL REFERENCES producers(id) ON DELETE RESTRICT,
  location text NOT NULL,
  time_zone text NOT NULL,
  UNIQUE (producer_id, location, time_zone),
  UNIQUE (id, producer_id)
);

ALTER TABLE pickup_slots ADD COLUMN pickup_point_id text;

INSERT INTO pickup_points (id, producer_id, location, time_zone)
SELECT gen_random_uuid()::text, producer_id, location, time_zone
FROM (SELECT DISTINCT producer_id, location, time_zone FROM pickup_slots) AS locations;

UPDATE pickup_slots AS slot
SET pickup_point_id = point.id
FROM pickup_points AS point
WHERE (slot.producer_id, slot.location, slot.time_zone) =
      (point.producer_id, point.location, point.time_zone);

ALTER TABLE pickup_slots
  ALTER COLUMN pickup_point_id SET NOT NULL,
  ADD FOREIGN KEY (pickup_point_id, producer_id) REFERENCES pickup_points(id, producer_id);
