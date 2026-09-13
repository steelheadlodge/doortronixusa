-- Factory freight spend. Never returned on customer order payloads.
ALTER TABLE orders ADD COLUMN freight_cost REAL;
