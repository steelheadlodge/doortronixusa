ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payments ADD COLUMN stripe_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_session ON payments(stripe_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_event ON payments(stripe_event_id);
CREATE TABLE IF NOT EXISTS processed_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
