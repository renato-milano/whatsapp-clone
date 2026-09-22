CREATE TABLE saved_messages (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, member_id)
);

CREATE INDEX saved_messages_by_member ON saved_messages(member_id, created_at);
