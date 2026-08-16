CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  label TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,          -- 'user' ou 'echo'
  content TEXT NOT NULL,
  source TEXT,                 -- 'human' ou 'gemini' (seulement pour role='echo')
  created_at INTEGER NOT NULL,
  needs_reply INTEGER DEFAULT 0,
  deadline INTEGER,
  replied INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance', '0');
