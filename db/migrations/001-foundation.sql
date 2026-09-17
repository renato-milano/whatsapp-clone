CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE health_probe (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  checked_at TEXT NOT NULL
);
