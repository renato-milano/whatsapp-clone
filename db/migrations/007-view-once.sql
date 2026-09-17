ALTER TABLE attachments ADD COLUMN view_once INTEGER NOT NULL DEFAULT 0 CHECK (view_once IN (0, 1));
ALTER TABLE attachments ADD COLUMN consumed_at TEXT;
