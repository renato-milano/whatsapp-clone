ALTER TABLE messages ADD COLUMN reply_to_id TEXT REFERENCES messages(id);
CREATE INDEX messages_reply_to ON messages(reply_to_id);
