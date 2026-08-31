CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  deposit_pct REAL NOT NULL DEFAULT 50,
  self_serve INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  project_name TEXT,
  location TEXT,
  po_number TEXT,
  ship_date_wanted TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  doors_json TEXT NOT NULL,
  list_total REAL,
  your_total REAL,
  confirmed_total REAL,
  deposit_amount REAL,
  deposit_paid INTEGER NOT NULL DEFAULT 0,
  balance_paid INTEGER NOT NULL DEFAULT 0,
  lead_time_text TEXT,
  lead_starts_at TEXT,
  ship_estimate TEXT,
  stripe_session_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  amount REAL NOT NULL,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('lead_time', '3–4 weeks from cleared deposit — call to confirm current lead times'),
  ('public_note', 'Published prices are contractor net. Doortronix confirms every order before fabrication.');
