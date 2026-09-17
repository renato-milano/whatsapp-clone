import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import { Server } from "socket.io";
import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  statSync,
  createWriteStream,
  createReadStream,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  ChatMessage,
  ClientEvents,
  ServerEvents,
} from "@private-chat/contracts";
import { openDatabase } from "./database.js";
import {
  createDeviceSession,
  getAuthContext,
  hashSecret,
  secretToken,
  validateLocator,
  validateName,
  validateSecret,
} from "./auth.js";



export interface AppOptions {
  dataDir: string;
  publicOrigin: string;
  staticRoot?: string;
  logger?: boolean;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: ["req.headers.cookie", "req.headers.authorization"],
          serializers: {
            req: (req) => ({ method: req.method, url: req.url?.split("?")[0] }),
          },
        }
      : false,
  });
  const db = openDatabase(options.dataDir);
  const mediaDir = join(options.dataDir, "media");
  const stagingDir = join(options.dataDir, "staging");
  try {
    await app.register(multipart, {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    });
    mkdirSync(mediaDir, { recursive: true, mode: 0o700 });
    mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
    if (
      options.staticRoot &&
      !existsSync(join(options.staticRoot, "index.html"))
    )
      throw new Error("Build the frontend before starting production");
  } catch (error) {
    db.close();
    throw error;
  }

  const io = new Server<ClientEvents, ServerEvents>(app.server, {
    serveClient: false,
    maxHttpBufferSize: 16_384,
    cors: { origin: options.publicOrigin },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, !origin || origin === options.publicOrigin);
    },
  });
  io.on("connection", (socket) => {
    const auth = getAuthContext(db, {
      headers: { cookie: socket.handshake.headers.cookie },
    } as FastifyRequest);
    if (auth) socket.join(auth.conversationId);
    socket.emit("service.ready", { status: "connected" });
    socket.on("service.ping", (ack) => {
      if (typeof ack === "function") ack({ status: "ok" });
    });
    socket.on("chat.message.send", (payload, ack) => {
      const auth = getAuthContext(db, {
        headers: { cookie: socket.handshake.headers.cookie },
      } as FastifyRequest);
      const body = typeof payload?.body === "string" ? payload.body.trim() : "";
      if (!auth || !body || body.length > 4000) {
        ack({ error: "Messaggio non valido o sessione scaduta." });
        return;
      }
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(
        "INSERT INTO messages (id, conversation_id, member_id, body, created_at, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        auth.conversationId,
        auth.memberId,
        body,
        createdAt,
        payload.replyToId ?? null,
      );
      const message: ChatMessage = {
        id,
        conversationId: auth.conversationId,
        memberId: auth.memberId,
        authorName: auth.displayName,
        body,
        createdAt,
      };
      if (payload.replyToId) {
        const reply = db
          .prepare(
            "SELECT id, body, (SELECT display_name FROM members WHERE id = member_id) AS authorName FROM messages WHERE id = ? AND conversation_id = ?",
          )
          .get(payload.replyToId, auth.conversationId) as
          { id: string; body: string; authorName: string } | undefined;
        if (reply) message.replyTo = reply;
      }
      io.to(auth.conversationId).emit("chat.message.created", message);
      ack({ message });
    });
    socket.on("chat.message.edit", (payload, ack) => {
      const auth = getAuthContext(db, {
        headers: { cookie: socket.handshake.headers.cookie },
      } as FastifyRequest);
      const body = typeof payload?.body === "string" ? payload.body.trim() : "";
      const row =
        auth &&
        db
          .prepare(
            "SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND member_id = ? AND deleted_at IS NULL",
          )
          .get(payload.id, auth.conversationId, auth.memberId);
      if (!auth || !row || !body || body.length > 4000)
        return ack({ error: "Messaggio non modificabile." });
      const editedAt = new Date().toISOString();
      db.prepare(
        "UPDATE messages SET body = ?, edited_at = ? WHERE id = ?",
      ).run(body, editedAt, payload.id);
      const message = db
        .prepare(
          "SELECT id, conversation_id AS conversationId, member_id AS memberId, body, created_at AS createdAt, edited_at AS editedAt FROM messages WHERE id = ?",
        )
        .get(payload.id) as ChatMessage;
      message.authorName = auth.displayName;
      io.to(auth.conversationId).emit("chat.message.updated", message);
      ack({ message });
    });
    socket.on("chat.message.delete", (payload, ack) => {
      const auth = getAuthContext(db, {
        headers: { cookie: socket.handshake.headers.cookie },
      } as FastifyRequest);
      const row =
        auth &&
        db
          .prepare(
            "SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND member_id = ? AND deleted_at IS NULL",
          )
          .get(payload.id, auth.conversationId, auth.memberId);
      if (!auth || !row) return ack({ error: "Messaggio non eliminabile." });
      const deletedAt = new Date().toISOString();
      db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?").run(
        deletedAt,
        payload.id,
      );
      io.to(auth.conversationId).emit("chat.message.deleted", {
        id: payload.id,
        deletedAt,
      });
      ack({ ok: true });
    });
    socket.on("chat.message.react", (payload, ack) => {
      const auth = getAuthContext(db, {
        headers: { cookie: socket.handshake.headers.cookie },
      } as FastifyRequest);
      const emoji =
        typeof payload?.emoji === "string" ? payload.emoji.slice(0, 8) : "";
      const message =
        auth &&
        db
          .prepare(
            "SELECT id FROM messages WHERE id = ? AND conversation_id = ?",
          )
          .get(payload.messageId, auth.conversationId);
      if (!auth || !message || !emoji)
        return ack({ error: "Reaction non valida." });
      db.prepare(
        "INSERT INTO message_reactions (message_id, member_id, emoji, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(message_id, member_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at",
      ).run(payload.messageId, auth.memberId, emoji, new Date().toISOString());
      const count = (
        db
          .prepare(
            "SELECT count(*) AS count FROM message_reactions WHERE message_id = ?",
          )
          .get(payload.messageId) as { count: number }
      ).count;
      io.to(auth.conversationId).emit("chat.message.reaction", {
        messageId: payload.messageId,
        emoji,
        count,
        memberId: auth.memberId,
        displayName: auth.displayName,
      });
      ack({ ok: true });
    });
    socket.on("chat.typing", (payload) => {
      const auth = getAuthContext(db, {
        headers: { cookie: socket.handshake.headers.cookie },
      } as FastifyRequest);
      if (!auth) return;
      socket.to(auth.conversationId).emit("chat.typing", {
        memberId: auth.memberId,
        displayName: auth.displayName,
        isTyping: Boolean(payload?.isTyping),
      });
    });
  });
  app.addHook("preClose", async () => {
    io.disconnectSockets(true);
    await io.close();
  });
  app.addHook("onClose", async () => {
    if (db.open) db.close();
  });
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    if (options.staticRoot)
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
    if (request.url.startsWith("/api/") || request.url.startsWith("/health/"))
      reply.header("Cache-Control", "no-store");
  });
  app.get("/health/live", async () => ({ status: "alive" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      db.transaction(() => {
        db.prepare("INSERT OR REPLACE INTO health_probe VALUES (1, ?)").run(
          new Date().toISOString(),
        );
        db.prepare("DELETE FROM health_probe WHERE id = 1").run();
      })();
      for (const directory of [mediaDir, stagingDir]) {
        const probe = join(directory, `.health-${randomUUID()}`);
        writeFileSync(probe, "", { mode: 0o600, flag: "wx" });
        unlinkSync(probe);
      }
      return { status: "ready", database: "ok", storage: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  if (options.staticRoot) {
    await app.register(fastifyStatic, {
      root: options.staticRoot,
      index: false,
    });
    app.get("/", async (_request, reply) =>
      reply.header("Cache-Control", "no-cache").sendFile("index.html"),
    );
    app.get<{ Params: { locator: string } }>(
      "/c/:locator",
      async (_request, reply) =>
        reply.header("Cache-Control", "no-cache").sendFile("index.html"),
    );
  }
  const secureCookie = new URL(options.publicOrigin).protocol === "https:";
  const apiError = (
    reply: FastifyReply,
    statusCode: number,
    code: string,
    message: string,
  ) => reply.code(statusCode).send({ error: { code, message } });
  app.post<{ Body: { displayName?: unknown; title?: unknown } }>(
    "/api/v1/conversations",
    async (request, reply) => {
      const displayName = validateName(request.body?.displayName);
      const title =
        typeof request.body?.title === "string"
          ? request.body.title.trim().slice(0, 100) || "Conversazione privata"
          : "Conversazione privata";
      if (!displayName)
        return apiError(
          reply,
          422,
          "INVALID_NAME",
          "Inserisci un nome da 1 a 50 caratteri.",
        );
      const inviteSecret = secretToken();
      const recoveryCode = secretToken();
      const id = randomUUID();
      const locator = secretToken(12);
      const now = new Date().toISOString();
      const memberId = randomUUID();
      try {
        db.transaction(() => {
          db.prepare(
            "INSERT INTO conversations (id, locator, title, invite_hash, created_at) VALUES (?, ?, ?, ?, ?)",
          ).run(id, locator, title, hashSecret(inviteSecret), now);
          db.prepare(
            "INSERT INTO members (id, conversation_id, slot, display_name, role, recovery_hash, created_at) VALUES (?, ?, 1, ?, 'owner', ?, ?)",
          ).run(memberId, id, displayName, hashSecret(recoveryCode), now);
        })();
      } catch {
        return apiError(
          reply,
          500,
          "CREATE_FAILED",
          "Non è stato possibile creare la conversazione.",
        );
      }
      createDeviceSession(db, memberId, id, secureCookie, reply);
      return reply.code(201).send({
        conversation: {
          id,
          locator,
          title,
          member: { id: memberId, displayName, role: "owner" },
        },
        inviteLink: `${options.publicOrigin}/c/${locator}#i=${inviteSecret}`,
        recoveryCode,
      });
    },
  );
  app.post<{
    Body: { locator?: unknown; inviteSecret?: unknown; displayName?: unknown };
  }>("/api/v1/conversations/join", async (request, reply) => {
    const locator = validateLocator(request.body?.locator);
    const inviteSecret = validateSecret(request.body?.inviteSecret);
    const displayName = validateName(request.body?.displayName);
    if (!locator || !inviteSecret || !displayName)
      return apiError(reply, 422, "INVALID_JOIN", "Link o nome non valido.");
    const conversation = db
      .prepare(
        "SELECT id, title, invite_hash, invite_open FROM conversations WHERE locator = ?",
      )
      .get(locator) as
      | { id: string; title: string; invite_hash: string; invite_open: number }
      | undefined;
    if (!conversation || hashSecret(inviteSecret) !== conversation.invite_hash)
      return apiError(
        reply,
        404,
        "INVITE_INVALID",
        "Il link di ingresso non è valido.",
      );
    const existing = db
      .prepare(
        "SELECT id, display_name, role FROM members WHERE conversation_id = ? AND revoked_at IS NULL AND lower(display_name) = lower(?)",
      )
      .get(conversation.id, displayName) as
      | { id: string; display_name: string; role: "owner" | "member" }
      | undefined;
    if (existing) {
      createDeviceSession(
        db,
        existing.id,
        conversation.id,
        secureCookie,
        reply,
      );
      return reply.code(200).send({
        conversation: {
          id: conversation.id,
          locator,
          title: conversation.title,
          member: {
            id: existing.id,
            displayName: existing.display_name,
            role: existing.role,
          },
        },
        recognized: true,
      });
    }
    if (conversation.invite_open !== 1)
      return apiError(
        reply,
        404,
        "INVITE_INVALID",
        "Il link di ingresso non è valido.",
      );
    const memberId = randomUUID();
    const recoveryCode = secretToken();
    const now = new Date().toISOString();
    try {
      db.transaction(() => {
        const occupied = db
          .prepare(
            "SELECT 1 FROM members WHERE conversation_id = ? AND slot = 2 AND revoked_at IS NULL",
          )
          .get(conversation.id);
        if (occupied) throw new Error("ROOM_FULL");
        db.prepare(
          "INSERT INTO members (id, conversation_id, slot, display_name, role, recovery_hash, created_at) VALUES (?, ?, 2, ?, 'member', ?, ?)",
        ).run(
          memberId,
          conversation.id,
          displayName,
          hashSecret(recoveryCode),
          now,
        );
        db.prepare("UPDATE conversations SET invite_open = 0 WHERE id = ?").run(
          conversation.id,
        );
      })();
    } catch (error) {
      return apiError(
        reply,
        error instanceof Error && error.message === "ROOM_FULL" ? 409 : 500,
        error instanceof Error && error.message === "ROOM_FULL"
          ? "ROOM_FULL"
          : "JOIN_FAILED",
        error instanceof Error && error.message === "ROOM_FULL"
          ? "I posti della conversazione sono già occupati."
          : "Non è stato possibile entrare nella conversazione.",
      );
    }
    createDeviceSession(db, memberId, conversation.id, secureCookie, reply);
    return reply.code(201).send({
      conversation: {
        id: conversation.id,
        locator,
        title: conversation.title,
        member: { id: memberId, displayName, role: "member" },
      },
      recoveryCode,
    });
  });
  app.get("/api/v1/me", async (request, reply) => {
    const auth = getAuthContext(db, request);
    if (!auth)
      return apiError(
        reply,
        401,
        "SESSION_REQUIRED",
        "La sessione non è valida.",
      );
    const conversation = db
      .prepare("SELECT id, locator, title FROM conversations WHERE id = ?")
      .get(auth.conversationId);
    return {
      member: {
        id: auth.memberId,
        displayName: auth.displayName,
        role: auth.role,
      },
      conversation: {
        ...(conversation as { id: string; locator: string; title: string }),
        member: {
          id: auth.memberId,
          displayName: auth.displayName,
          role: auth.role,
        },
      },
    };
  });
  app.get<{ Querystring: { before?: string; after?: string; q?: string; around?: string } }>(
    "/api/v1/messages",
    async (request, reply) => {
      const auth = getAuthContext(db, request);
      if (!auth)
        return apiError(
          reply,
          401,
          "SESSION_REQUIRED",
          "La sessione non è valida.",
        );
      const before = request.query.before;
      const after = request.query.after;
      const query = request.query.q?.trim();
      const around = request.query.around;
      const matchRows = query
        ? (db
            .prepare(
              "SELECT id, created_at AS createdAt FROM messages WHERE conversation_id = ? AND deleted_at IS NULL AND body LIKE ? ORDER BY created_at DESC, id DESC",
            )
            .all(auth.conversationId, `%${query}%`) as Array<{ id: string; createdAt: string }>)
        : [];
      const total = query
        ? (db
            .prepare(
              "SELECT count(*) AS count FROM messages WHERE conversation_id = ? AND deleted_at IS NULL AND body LIKE ?",
            )
            .get(auth.conversationId, `%${query}%`) as { count: number }).count
        : undefined;
      let contextIds: string[] | undefined;
      const contextTarget = around ?? (query ? matchRows[0]?.id : undefined);
      if (contextTarget) {
        const target = db
          .prepare("SELECT created_at AS createdAt FROM messages WHERE id = ? AND conversation_id = ?")
          .get(contextTarget, auth.conversationId) as { createdAt: string } | undefined;
        if (target) {
          const older = db
            .prepare("SELECT id FROM messages WHERE conversation_id = ? AND deleted_at IS NULL AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 50")
            .all(auth.conversationId, target.createdAt) as Array<{ id: string }>;
          const newer = db
            .prepare("SELECT id FROM messages WHERE conversation_id = ? AND deleted_at IS NULL AND created_at > ? ORDER BY created_at ASC, id ASC LIMIT 50")
            .all(auth.conversationId, target.createdAt) as Array<{ id: string }>;
          contextIds = [contextTarget, ...older.map((row) => row.id), ...newer.map((row) => row.id)];
        }
      }
      const descendingWindow = !contextIds && !after;
      const rows = db
        .prepare(
          `SELECT m.id, m.conversation_id AS conversationId, m.member_id AS memberId, u.display_name AS authorName, m.body, m.created_at AS createdAt, m.edited_at AS editedAt, a.id AS attachmentId, a.filename AS attachmentFilename, a.mime_type AS attachmentMime, a.size AS attachmentSize, a.view_once AS attachmentViewOnce, a.consumed_at AS attachmentConsumedAt, r.id AS replyId, r.body AS replyBody, ru.display_name AS replyAuthor FROM messages m JOIN members u ON u.id = m.member_id LEFT JOIN attachments a ON a.message_id = m.id LEFT JOIN messages r ON r.id = m.reply_to_id LEFT JOIN members ru ON ru.id = r.member_id WHERE m.conversation_id = ? AND m.deleted_at IS NULL ${query && !contextIds ? "AND m.body LIKE ?" : ""} ${contextIds ? `AND m.id IN (${contextIds.map(() => "?").join(",")})` : ""} ${before ? "AND (m.created_at < (SELECT created_at FROM messages WHERE id = ?))" : ""} ${after ? "AND (m.created_at > (SELECT created_at FROM messages WHERE id = ?))" : ""} ORDER BY m.created_at ${descendingWindow ? "DESC" : "ASC"}, m.id ${descendingWindow ? "DESC" : "ASC"} ${(!query || before || after) && !contextIds ? "LIMIT 100" : ""}`,
        )
        .all(
          ...([
            auth.conversationId,
            ...(query && !contextIds ? [`%${query}%`] : []),
            ...(contextIds ?? []),
            ...(before ? [before] : []),
            ...(after ? [after] : []),
          ] as string[]),
        ) as ChatMessage[];
      return {
        ...(total === undefined ? {} : { total }),
        ...(query ? { matches: matchRows } : {}),
        messages: (descendingWindow ? rows.reverse() : rows).map((row) => {
          const item = row as ChatMessage & {
            replyId?: string;
            replyBody?: string;
            replyAuthor?: string;
            attachmentId?: string;
            attachmentFilename?: string;
            attachmentMime?: string;
            attachmentSize?: number;
            attachmentViewOnce?: number;
            attachmentConsumedAt?: string;
          };
          if (item.replyId)
            item.replyTo = {
              id: item.replyId,
              body: item.replyBody ?? "",
              authorName: item.replyAuthor ?? "",
            };
          delete item.replyId;
          delete item.replyBody;
          delete item.replyAuthor;
          if (item.attachmentId)
            item.attachment = {
              id: item.attachmentId,
              filename: item.attachmentFilename ?? "file",
              mimeType: item.attachmentMime ?? "application/octet-stream",
              size: item.attachmentSize ?? 0,
              viewOnce: item.attachmentViewOnce === 1,
              consumedAt: item.attachmentConsumedAt,
            };
          const reaction = db
            .prepare(
              "SELECT mr.emoji, count(*) AS count, group_concat(m.display_name, ', ') AS names FROM message_reactions mr JOIN members m ON m.id = mr.member_id WHERE mr.message_id = ? GROUP BY mr.emoji ORDER BY count DESC LIMIT 1",
            )
            .get(item.id) as
            { emoji: string; count: number; names?: string } | undefined;
          if (reaction)
            item.reaction = {
              emoji: reaction.emoji,
              count: reaction.count,
              mine: false,
              names: reaction.names?.split(", "),
            };
          return item;
        }),
      };
    },
  );
  app.get<{ Params: { id: string } }>("/media/:id", async (request, reply) => {
    const auth = getAuthContext(db, request);
    if (!auth) return reply.code(401).send();
    const row = db
      .prepare(
        "SELECT a.storage_path, a.mime_type, a.filename, a.view_once AS viewOnce, a.consumed_at AS consumedAt, m.member_id AS senderMemberId FROM attachments a JOIN messages m ON m.id = a.message_id WHERE a.id = ? AND m.conversation_id = ?",
      )
      .get(request.params.id, auth.conversationId) as
      { storage_path: string; mime_type: string; filename: string; viewOnce: number; consumedAt?: string; senderMemberId: string } | undefined;
    if (!row || !existsSync(row.storage_path)) return reply.code(404).send();
    if (row.viewOnce && row.senderMemberId === auth.memberId)
      return reply.code(403).send();
    const size = statSync(row.storage_path).size;
    const responseMime = row.mime_type === "audio/mp4" && row.filename.toLowerCase().endsWith(".opus")
      ? "audio/ogg"
      : row.mime_type;
    if (row.viewOnce) {
      if (row.consumedAt) return reply.code(410).send();
      const consumed = db
        .prepare("UPDATE attachments SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
        .run(new Date().toISOString(), request.params.id);
      if (consumed.changes !== 1) return reply.code(410).send();
      return reply
        .type(responseMime)
        .header("Content-Length", size)
        .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`)
        .send(createReadStream(row.storage_path));
    }
    const range = request.headers.range;
    const common = reply
      .type(responseMime)
      .header("Accept-Ranges", "bytes")
      .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    if (range?.startsWith("bytes=")) {
      const [startText, endText] = range.slice(6).split("-", 2);
      const start = Number(startText);
      const requestedEnd = endText ? Number(endText) : size - 1;
      const end = Number.isFinite(requestedEnd) ? Math.min(requestedEnd, size - 1) : size - 1;
      if (!Number.isInteger(start) || start < 0 || start >= size || end < start)
        return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      return common
        .code(206)
        .header("Content-Length", end - start + 1)
        .header("Content-Range", `bytes ${start}-${end}/${size}`)
        .send(createReadStream(row.storage_path, { start, end }));
    }
    return common.header("Content-Length", size).send(createReadStream(row.storage_path));
  });
  app.post("/api/v1/messages/attachment", async (request, reply) => {
    const auth = getAuthContext(db, request);
    if (!auth)
      return apiError(
        reply,
        401,
        "SESSION_REQUIRED",
        "La sessione non è valida.",
      );
    const part = await request.file();
    if (!part)
      return apiError(reply, 422, "FILE_REQUIRED", "Seleziona un file.");
    const id = randomUUID();
    const storagePath = join(mediaDir, id);
    await pipeline(part.file, createWriteStream(storagePath, { mode: 0o600 }));
    const stat = (await import("node:fs/promises")).stat(storagePath);
    const size = (await stat).size;
    const messageId = randomUUID();
    const now = new Date().toISOString();
    const captionField = (part.fields as Record<string, unknown> | undefined)
      ?.caption as { value?: unknown } | undefined;
    const replyField = (part.fields as Record<string, unknown> | undefined)
      ?.replyToId as { value?: unknown } | undefined;
    const replyToId =
      typeof replyField?.value === "string" ? replyField.value : null;
    const caption =
      typeof captionField?.value === "string"
        ? captionField.value.slice(0, 4000)
        : "";
    const viewOnceField = (part.fields as Record<string, unknown> | undefined)
      ?.viewOnce as { value?: unknown } | undefined;
    const viewOnce = viewOnceField?.value === "1" || viewOnceField?.value === "true";
    db.transaction(() => {
      db.prepare(
        "INSERT INTO messages (id, conversation_id, member_id, body, created_at, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        messageId,
        auth.conversationId,
        auth.memberId,
        caption,
        now,
        replyToId,
      );
      db.prepare(
        "INSERT INTO attachments (id, message_id, filename, mime_type, size, storage_path, created_at, view_once) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        messageId,
        part.filename.slice(0, 255),
        part.mimetype,
        size,
        storagePath,
        now,
        viewOnce ? 1 : 0,
      );
    })();
    io.to(auth.conversationId).emit("chat.message.created", {
      id: messageId,
      conversationId: auth.conversationId,
      memberId: auth.memberId,
      authorName: auth.displayName,
      body: caption,
      createdAt: now,
      attachment: {
        id,
        filename: part.filename,
        mimeType: part.mimetype,
        size,
        viewOnce,
      },
    });
    return reply.code(201).send({
      id: messageId,
      filename: part.filename,
      mimeType: part.mimetype,
      size,
    });
  });
  app.post("/api/v1/logout", async (request, reply) => {
    const auth = getAuthContext(db, request);
    if (auth)
      db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        auth.sessionId,
      );
    const cookieName = secureCookie ? "__Host-chat_session" : "chat_session";
    reply.header(
      "Set-Cookie",
      `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureCookie ? "; Secure" : ""}`,
    );
    return { ok: true };
  });
  app.post<{ Body: { locator?: unknown; recoveryCode?: unknown } }>(
    "/api/v1/conversations/recover",
    async (request, reply) => {
      const locator = validateLocator(request.body?.locator);
      const recoveryCode = validateSecret(request.body?.recoveryCode);
      if (!locator || !recoveryCode)
        return apiError(
          reply,
          422,
          "INVALID_RECOVERY_CODE",
          "Il codice di recupero non è valido.",
        );
      const row = db
        .prepare(
          "SELECT c.id AS conversation_id, c.title, m.id AS member_id, m.display_name, m.role, m.recovery_hash FROM conversations c JOIN members m ON m.conversation_id = c.id AND m.revoked_at IS NULL WHERE c.locator = ?",
        )
        .get(locator) as
        | {
            conversation_id: string;
            title: string;
            member_id: string;
            display_name: string;
            role: "owner" | "member";
            recovery_hash: string;
          }
        | undefined;
      if (!row || hashSecret(recoveryCode) !== row.recovery_hash)
        return apiError(
          reply,
          404,
          "RECOVERY_FAILED",
          "Il codice di recupero non è corretto.",
        );
      createDeviceSession(
        db,
        row.member_id,
        row.conversation_id,
        secureCookie,
        reply,
      );
      return {
        conversation: {
          id: row.conversation_id,
          locator,
          title: row.title,
          member: {
            id: row.member_id,
            displayName: row.display_name,
            role: row.role,
          },
        },
        member: {
          id: row.member_id,
          displayName: row.display_name,
          role: row.role,
        },
      };
    },
  );
  app.setNotFoundHandler(async (_request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "Risorsa non disponibile." },
    }),
  );
  return app;
}
