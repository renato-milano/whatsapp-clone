import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../apps/server/src/database.js";
import { hashSecret, secretToken } from "../apps/server/src/auth.js";

const exportDir = resolve(process.argv[2] ?? "WhatsApp Chat - Giada");
const chatFile = join(exportDir, "_chat.txt");
const dataDir = resolve(process.env.DATA_DIR ?? "./data");
const publicOrigin = process.env.PUBLIC_ORIGIN ?? "http://localhost:5173";

if (!existsSync(chatFile)) throw new Error(`Export non trovato: ${chatFile}`);

const mimeByExt: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".opus": "audio/opus", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".pdf": "application/pdf",
};

type Parsed = { date: Date; author: string; body: string };
const lines = readFileSync(chatFile, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
const parsed: Parsed[] = [];
const lineRe = /^\u200e?\[(\d{1,2})\/(\d{1,2})\/(\d{2}),\s*(\d{1,2}):(\d{2}):(\d{2})\]\s*([^:]+):\s?(.*)$/;
for (const raw of lines) {
  const line = raw.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
  const m = line.match(lineRe);
  if (m) {
    const [, day, month, year, hour, minute, second, author, body] = m;
    parsed.push({
      date: new Date(2000 + Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
      author: author.trim(),
      body: body.trim(),
    });
  } else if (parsed.length && raw.trim()) {
    parsed[parsed.length - 1].body += `\n${raw.trim()}`;
  }
}

const db = openDatabase(dataDir);
const now = new Date().toISOString();
const existing = db.prepare("SELECT id, locator FROM conversations WHERE lower(title) = lower(?)").get("filo rosso") as { id: string; locator: string } | undefined;
const existingMessage = existing && db.prepare("SELECT 1 FROM messages WHERE conversation_id = ? LIMIT 1").get(existing.id);
if (existing && existingMessage) {
  db.close();
  throw new Error(`La stanza \"filo rosso\" contiene già messaggi (locator ${existing.locator}); importazione annullata per evitare duplicati.`);
}

const conversationId = existing?.id ?? randomUUID();
const locator = existing?.locator ?? secretToken(18);
const inviteSecret = secretToken(24);
const renatoRecovery = secretToken(18);
const giadaRecovery = secretToken(18);
const renatoId = (existing && db.prepare("SELECT id FROM members WHERE conversation_id = ? AND slot = 1").get(existing.id) as { id: string } | undefined)?.id ?? randomUUID();
const giadaId = (existing && db.prepare("SELECT id FROM members WHERE conversation_id = ? AND slot = 2").get(existing.id) as { id: string } | undefined)?.id ?? randomUUID();
const mediaDir = join(dataDir, "media");
mkdirSync(mediaDir, { recursive: true, mode: 0o700 });

const authorId = (name: string) => {
  const normalized = name.trim().toLocaleLowerCase("it-IT");
  if (normalized === "ren" || normalized === "renato") return renatoId;
  if (normalized === "giada") return giadaId;
  return undefined;
};

let imported = 0;
let skipped = 0;
let attachments = 0;
const attachmentRows: Array<{ id: string; messageId: string; filename: string; mime: string; size: number; storage: string; created: string }> = [];
const messageRows: Array<{ id: string; memberId: string; body: string; created: string; edited: string | null; deleted: string | null }> = [];

for (const item of parsed) {
  const memberId = authorId(item.author);
  if (!memberId) { skipped++; continue; }
  const created = item.date.toISOString();
  const attachmentMatch = item.body.match(/<allegato:\s*([^>]+)>/i);
  const filename = attachmentMatch?.[1]?.trim();
  const isDeleted = /questo messaggio è stato eliminato/i.test(item.body);
  const isEdited = /questo messaggio è stato modificato/i.test(item.body);
  const body = item.body
    .replace(/\s*<allegato:\s*[^>]+>\s*/i, "")
    .replace(/\s*‎?<Questo messaggio è stato modificato>\s*/i, "")
    .trim();
  const id = randomUUID();
  messageRows.push({ id, memberId, body, created, edited: isEdited ? created : null, deleted: isDeleted ? created : null });
  imported++;
  if (filename) {
    const source = join(exportDir, basename(filename));
    if (existsSync(source) && statSync(source).isFile()) {
      const attachmentId = randomUUID();
      const storage = join(mediaDir, attachmentId);
      copyFileSync(source, storage);
      attachmentRows.push({ id: attachmentId, messageId: id, filename: basename(filename), mime: mimeByExt[extname(filename).toLowerCase()] ?? "application/octet-stream", size: statSync(source).size, storage, created });
      attachments++;
    }
  }
}

db.transaction(() => {
  if (existing) {
    db.prepare("UPDATE conversations SET invite_hash = ?, invite_open = 0, title = ? WHERE id = ?").run(hashSecret(inviteSecret), "filo rosso", conversationId);
    db.prepare("UPDATE members SET display_name = 'Renato', recovery_hash = ?, revoked_at = NULL WHERE id = ?").run(hashSecret(renatoRecovery), renatoId);
    db.prepare("INSERT OR IGNORE INTO members (id, conversation_id, slot, display_name, role, recovery_hash, created_at) VALUES (?, ?, 2, 'Giada', 'member', ?, ?)").run(giadaId, conversationId, hashSecret(giadaRecovery), now);
    db.prepare("UPDATE members SET display_name = 'Giada', recovery_hash = ?, revoked_at = NULL WHERE id = ?").run(hashSecret(giadaRecovery), giadaId);
  } else {
    db.prepare("INSERT INTO conversations (id, locator, title, invite_hash, invite_open, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(conversationId, locator, "filo rosso", hashSecret(inviteSecret), now);
    db.prepare("INSERT INTO members (id, conversation_id, slot, display_name, role, recovery_hash, created_at) VALUES (?, ?, 1, ?, 'owner', ?, ?)").run(renatoId, conversationId, "Renato", hashSecret(renatoRecovery), now);
    db.prepare("INSERT INTO members (id, conversation_id, slot, display_name, role, recovery_hash, created_at) VALUES (?, ?, 2, ?, 'member', ?, ?)").run(giadaId, conversationId, "Giada", hashSecret(giadaRecovery), now);
  }
  const insertMessage = db.prepare("INSERT INTO messages (id, conversation_id, member_id, body, created_at, edited_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of messageRows) insertMessage.run(row.id, conversationId, row.memberId, row.body, row.created, row.edited, row.deleted);
  const insertAttachment = db.prepare("INSERT INTO attachments (id, message_id, filename, mime_type, size, storage_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const row of attachmentRows) insertAttachment.run(row.id, row.messageId, row.filename, row.mime, row.size, row.storage, row.created);
})();
db.close();

console.log(JSON.stringify({ title: "filo rosso", locator, inviteLink: `${publicOrigin}/c/${locator}#i=${inviteSecret}`, recovery: { Renato: renatoRecovery, Giada: giadaRecovery }, imported, skipped, attachments }, null, 2));
