CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT
);

CREATE INDEX messages_by_conversation ON messages(conversation_id, created_at, id);
