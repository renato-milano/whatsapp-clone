CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  locator TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  invite_hash TEXT NOT NULL,
  invite_open INTEGER NOT NULL DEFAULT 1 CHECK (invite_open IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  recovery_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (conversation_id, slot)
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE device_memberships (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (device_id, member_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX sessions_active_by_token ON sessions(token_hash, revoked_at, expires_at);
CREATE INDEX memberships_active_by_device ON device_memberships(device_id, revoked_at);
CREATE INDEX members_by_conversation ON members(conversation_id, revoked_at);
