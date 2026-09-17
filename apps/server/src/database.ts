import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./config.js";

export function openDatabase(
  dataDir: string,
  migrationsDir = join(projectRoot, "db/migrations"),
) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new Database(join(dataDir, "chat.sqlite"));
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    for (const name of readdirSync(migrationsDir)
      .filter((name) => /^\d+[-\w]*\.sql$/.test(name))
      .sort()) {
      const sql = readFileSync(join(migrationsDir, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      db.transaction(() => {
        const existing = db
          .prepare("SELECT checksum FROM schema_migrations WHERE name = ?")
          .get(name) as { checksum: string } | undefined;
        if (existing) {
          if (existing.checksum !== checksum)
            throw new Error(`Applied migration changed: ${name}`);
          return;
        }
        db.exec(sql);
        db.prepare("INSERT INTO schema_migrations VALUES (?, ?, ?)").run(
          name,
          checksum,
          new Date().toISOString(),
        );
      })();
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
