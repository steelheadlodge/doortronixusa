-- Saved quotes (drafts). Any account holder can save an in-progress quote and
-- return to it later. Kept separate from orders so payments/admin never touch them.
CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  title TEXT,
  project_name TEXT,
  location TEXT,
  po_number TEXT,
  ship_date TEXT,
  ship_to TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  doors_json TEXT NOT NULL,
  list_total REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_drafts_company ON drafts(company_id);
CREATE INDEX idx_drafts_user ON drafts(user_id);
