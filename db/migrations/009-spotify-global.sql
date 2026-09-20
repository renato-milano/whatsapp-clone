CREATE TABLE spotify_app_connection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  spotify_user_id TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT NOT NULL,
  access_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
