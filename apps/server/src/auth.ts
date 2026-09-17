import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { FastifyReply, FastifyRequest } from "fastify";

export const SESSION_COOKIE = "__Host-chat_session";
const LOCAL_SESSION_COOKIE = "chat_session";
const SESSION_DAYS = 180;

export function secretToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0)
      cookies.set(
        part.slice(0, index).trim(),
        decodeURIComponent(part.slice(index + 1).trim()),
      );
  }
  return cookies;
}
function setSessionCookie(reply: FastifyReply, token: string, secure: boolean) {
  const cookieName = secure ? SESSION_COOKIE : LOCAL_SESSION_COOKIE;
  const attributes = [
    cookieName + "=" + encodeURIComponent(token),
    "Path=/",
    "Max-Age=" + SESSION_DAYS * 86400,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) attributes.push("Secure");
  reply.header("Set-Cookie", attributes.join("; "));
}
export interface AuthContext {
  sessionId: string;
  deviceId: string;
  memberId: string;
  conversationId: string;
  displayName: string;
  role: "owner" | "member";
}
export function createDeviceSession(
  db: Database.Database,
  memberId: string,
  conversationId: string,
  secure: boolean,
  reply: FastifyReply,
  now = new Date(),
) {
  const token = secretToken();
  const nowIso = now.toISOString();
  const expires = new Date(
    now.getTime() + SESSION_DAYS * 86400000,
  ).toISOString();
  const deviceId = randomUUID();
  const sessionId = randomUUID();
  db.transaction(() => {
    db.prepare(
      "INSERT INTO devices (id, created_at, last_seen_at) VALUES (?, ?, ?)",
    ).run(deviceId, nowIso, nowIso);
    db.prepare(
      "INSERT INTO device_memberships (device_id, member_id, created_at) VALUES (?, ?, ?)",
    ).run(deviceId, memberId, nowIso);
    db.prepare(
      "INSERT INTO sessions (id, device_id, token_hash, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(sessionId, deviceId, hashSecret(token), nowIso, expires, nowIso);
  })();
  setSessionCookie(reply, token, secure);
  return { deviceId, sessionId, expiresAt: expires };
}
export function getAuthContext(
  db: Database.Database,
  request: FastifyRequest,
): AuthContext | undefined {
  const cookies = parseCookies(request.headers.cookie);
  const token =
    cookies.get(SESSION_COOKIE) ?? cookies.get(LOCAL_SESSION_COOKIE);
  if (!token) return undefined;
  const row = db
    .prepare(
      "SELECT s.id AS session_id, d.id AS device_id, m.id AS member_id, m.display_name, m.role, m.conversation_id FROM sessions s JOIN devices d ON d.id = s.device_id JOIN device_memberships dm ON dm.device_id = d.id AND dm.revoked_at IS NULL JOIN members m ON m.id = dm.member_id AND m.revoked_at IS NULL WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?",
    )
    .get(hashSecret(token), new Date().toISOString()) as
    | {
        session_id: string;
        device_id: string;
        member_id: string;
        display_name: string;
        role: "owner" | "member";
        conversation_id: string;
      }
    | undefined;
  if (!row) return undefined;
  const now = new Date().toISOString();
  db.prepare("UPDATE sessions SET last_used_at = ? WHERE id = ?").run(
    now,
    row.session_id,
  );
  db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(
    now,
    row.device_id,
  );
  return {
    sessionId: row.session_id,
    deviceId: row.device_id,
    memberId: row.member_id,
    conversationId: row.conversation_id,
    displayName: row.display_name,
    role: row.role,
  };
}
export function validateName(value: unknown) {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return !name || [...name].length > 50 ? undefined : name;
}
export function validateLocator(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(value)
    ? value
    : undefined;
}
export function validateSecret(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,128}$/.test(value)
    ? value
    : undefined;
}
