CREATE TABLE spotify_connections (
  member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  spotify_user_id TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT NOT NULL,
  access_expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE spotify_oauth_states (
  state TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE message_music (
  message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  track_uri TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  image_url TEXT,
  spotify_url TEXT NOT NULL,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL
);
