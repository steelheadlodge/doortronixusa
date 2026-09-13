-- Actual ship date starts the 1-year warranty clock. Tracking is for the customer.
ALTER TABLE orders ADD COLUMN shipped_on TEXT;
ALTER TABLE orders ADD COLUMN warranty_ends TEXT;
ALTER TABLE orders ADD COLUMN carrier TEXT;
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN pro_number TEXT;
ALTER TABLE orders ADD COLUMN freight_type TEXT;
ALTER TABLE orders ADD COLUMN ship_notes TEXT;
ALTER TABLE orders ADD COLUMN serials_json TEXT;
ALTER TABLE orders ADD COLUMN warranty_claims_json TEXT;
