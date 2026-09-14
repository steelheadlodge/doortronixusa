-- Clock for ETA ship: later of deposit received and signed drawing, then +4 weeks
-- rolled to the first weekday that is not a US federal holiday.
ALTER TABLE orders ADD COLUMN drawing_signed_on TEXT;
ALTER TABLE orders ADD COLUMN deposit_paid_on TEXT;
UPDATE orders SET deposit_paid_on = lead_starts_at
  WHERE deposit_paid_on IS NULL AND lead_starts_at IS NOT NULL AND lead_starts_at != '';
