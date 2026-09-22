import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import type { ChatMessage } from "@private-chat/contracts";
import { getAuthContext } from "./auth.js";
import { previewText } from "./preview.js";

// MCP uses the same member sessions as the browser. Its cursor follows insertion
// order, so messages sharing a timestamp are never skipped while polling.
export function registerMcpRoutes(
  app: FastifyInstance,
  db: Database.Database,
  publish: (message: ChatMessage) => void,
) {
  app.get<{
    Querystring: {
      after?: string;
      before?: string;
      q?: string;
      limit?: string;
    };
  }>("/api/v1/mcp/messages", async (request, reply) => {
    const auth = getAuthContext(db, request);
    if (!auth)
      return reply.code(401).send({ error: { code: "SESSION_REQUIRED" } });
    const { after, before, q } = request.query;
    const limit = Number(request.query.limit ?? 50);
    const validCursor = (value: string | undefined) =>
      value === undefined ||
      (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)));
    if (
      !validCursor(after) ||
      !validCursor(before) ||
      (after !== undefined && before !== undefined) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (q !== undefined && (!q.trim() || q.length > 200))
    )
      return reply.code(422).send({ error: { code: "INVALID_QUERY" } });
    const forward = after !== undefined;
    const rows = db
      .prepare(
        `
        SELECT m.rowid AS cursor, m.id, m.conversation_id AS conversationId,
          m.member_id AS memberId, u.display_name AS authorName, m.body,
          m.created_at AS createdAt, m.edited_at AS editedAt, m.reply_to_id AS replyToId
        FROM messages m JOIN members u ON u.id = m.member_id
        WHERE m.conversation_id = ? AND m.deleted_at IS NULL
          ${after !== undefined ? "AND m.rowid > ?" : ""}
          ${before !== undefined ? "AND m.rowid < ?" : ""}
          ${q ? "AND instr(lower(m.body), lower(?)) > 0" : ""}
        ORDER BY m.rowid ${forward ? "ASC" : "DESC"} LIMIT ?
      `,
      )
      .all(
        auth.conversationId,
        ...(after !== undefined ? [Number(after)] : []),
        ...(before !== undefined ? [Number(before)] : []),
        ...(q ? [q.trim()] : []),
        limit + 1,
      ) as Array<ChatMessage & { cursor: number }>;
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit);
    if (!forward) messages.reverse();
    return {
      messages,
      oldestCursor: messages[0]?.cursor ?? null,
      latestCursor: messages.at(-1)?.cursor ?? Number(after ?? 0),
      hasMore,
    };
  });
  app.post<{ Body: { body?: unknown; replyToId?: unknown } }>(
    "/api/v1/mcp/messages",
    async (request, reply) => {
      const auth = getAuthContext(db, request);
      if (!auth)
        return reply.code(401).send({ error: { code: "SESSION_REQUIRED" } });
      const body =
        typeof request.body?.body === "string" ? request.body.body.trim() : "";
      const replyToId = request.body?.replyToId;
      if (
        !body ||
        body.length > 4000 ||
        (replyToId !== undefined &&
          (typeof replyToId !== "string" || !replyToId))
      )
        return reply.code(422).send({ error: { code: "INVALID_MESSAGE" } });
      let replyTo: ChatMessage["replyTo"];
      if (typeof replyToId === "string") {
        const quoted = db
          .prepare(
            "SELECT m.id, m.body, u.display_name AS authorName, mm.title AS musicTitle, a.mime_type AS attachmentMime, a.filename AS attachmentFilename FROM messages m JOIN members u ON u.id = m.member_id LEFT JOIN attachments a ON a.message_id = m.id LEFT JOIN message_music mm ON mm.message_id = m.id WHERE m.id = ? AND m.conversation_id = ? AND m.deleted_at IS NULL",
          )
          .get(replyToId, auth.conversationId) as
          | {
              id: string;
              body: string;
              authorName: string;
              musicTitle?: string;
              attachmentMime?: string;
              attachmentFilename?: string;
            }
          | undefined;
        if (!quoted)
          return reply.code(404).send({ error: { code: "MESSAGE_NOT_FOUND" } });
        replyTo = {
          id: quoted.id,
          authorName: quoted.authorName,
          body: previewText(quoted),
        };
      }
      const message: ChatMessage = {
        id: randomUUID(),
        conversationId: auth.conversationId,
        memberId: auth.memberId,
        authorName: auth.displayName,
        body,
        createdAt: new Date().toISOString(),
        ...(replyTo ? { replyTo } : {}),
      };
      db.prepare(
        "INSERT INTO messages (id, conversation_id, member_id, body, created_at, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        message.id,
        message.conversationId,
        message.memberId,
        message.body,
        message.createdAt,
        replyToId ?? null,
      );
      publish(message);
      return reply.code(201).send({ message });
    },
  );
}
