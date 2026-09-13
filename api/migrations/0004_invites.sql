-- Admin-created invites: company + user exist with a discount; customer
-- sets their own password from a one-time link.
CREATE TABLE invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  email TEXT NOT NULL COLLATE NOCASE,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invites_email ON invites(email);
CREATE INDEX idx_invites_user ON invites(user_id);
