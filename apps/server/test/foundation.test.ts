import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io } from "socket.io-client";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/database.js";
import { previewText } from "../src/preview.js";

test("production serves only its frontend directory, not database files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-static-data-"));
  const web = mkdtempSync(join(tmpdir(), "private-chat-static-web-"));
  writeFileSync(
    join(web, "index.html"),
    "<!doctype html><title>Private chat</title>",
  );
  const app = await buildApp({
    dataDir: dir,
    publicOrigin: "https://chat.example",
    staticRoot: web,
  });
  try {
    const response = await app.inject("/");
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Private chat/);
    assert.match(
      response.headers["content-security-policy"] as string,
      /frame-ancestors 'none'/,
    );
    assert.equal((await app.inject("/api/unknown")).statusCode, 404);
    assert.equal((await app.inject("/chat.sqlite")).statusCode, 404);
    assert.equal((await app.inject("/c/example-room")).statusCode, 200);
    assert.equal(
      (await app.inject("/%2e%2e/data/chat.sqlite")).statusCode,
      404,
    );
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(web, { recursive: true, force: true });
  }
});

test("SQLite persists data across restarts and migrations are idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-db-"));
  try {
    let db = openDatabase(dir);
    db.prepare("INSERT INTO app_metadata VALUES (?, ?)").run(
      "test",
      "persisted",
    );
    db.close();
    db = openDatabase(dir);
    assert.deepEqual(
      db.prepare("SELECT value FROM app_metadata WHERE key = ?").get("test"),
      { value: "persisted" },
    );
    assert.equal(
      (
        db.prepare("SELECT count(*) AS count FROM schema_migrations").get() as {
          count: number;
        }
      ).count,
      10,
    );
    assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("failed migrations roll back and can be retried", () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-migration-"));
  const migrations = mkdtempSync(join(tmpdir(), "private-chat-sql-"));
  try {
    const file = join(migrations, "001-test.sql");
    writeFileSync(file, "CREATE TABLE sample (id INTEGER); INVALID SQL;");
    assert.throws(() => openDatabase(dir, migrations));
    writeFileSync(file, "CREATE TABLE sample (id INTEGER);");
    const db = openDatabase(dir, migrations);
    assert.equal(
      (
        db.prepare("SELECT count(*) AS count FROM sample").get() as {
          count: number;
        }
      ).count,
      0,
    );
    db.close();
    writeFileSync(file, "CREATE TABLE changed (id INTEGER);");
    assert.throws(
      () => openDatabase(dir, migrations),
      /Applied migration changed/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(migrations, { recursive: true, force: true });
  }
});

test("readiness checks actual storage and private files are not served", async () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-health-"));
  const app = await buildApp({
    dataDir: dir,
    publicOrigin: "http://localhost:5173",
  });
  try {
    const ready = await app.inject("/health/ready");
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), {
      status: "ready",
      database: "ok",
      storage: "ok",
    });
    assert.equal(ready.headers["cache-control"], "no-store");
    for (const path of [
      "/data/chat.sqlite",
      "/media/test.jpg",
      "/api/v1/messages",
    ])
      assert.equal(
        (await app.inject(path)).statusCode,
        path === "/media/test.jpg" || path === "/api/v1/messages" ? 401 : 404,
      );
    rmSync(join(dir, "staging"), { recursive: true });
    assert.equal((await app.inject("/health/ready")).statusCode, 503);
    assert.equal((await app.inject("/health/live")).statusCode, 200);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("realtime connects from the configured origin and rejects another origin", async () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-socket-"));
  const origin = "http://localhost:5173";
  const app = await buildApp({ dataDir: dir, publicOrigin: origin });
  const url = await app.listen({ port: 0, host: "127.0.0.1" });
  const good = io(url, {
    transports: ["websocket"],
    extraHeaders: { origin },
    reconnection: false,
    autoConnect: false,
  });
  const bad = io(url, {
    transports: ["websocket"],
    extraHeaders: { origin: "https://untrusted.example" },
    reconnection: false,
    autoConnect: false,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Realtime timeout")),
        3000,
      );
      good.once("service.ready", (data) => {
        clearTimeout(timer);
        assert.deepEqual(data, { status: "connected" });
        resolve();
      });
      good.once("connect_error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      good.connect();
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Origin rejection timeout")),
        3000,
      );
      bad.once("connect", () => {
        clearTimeout(timer);
        reject(new Error("Unexpected connection"));
      });
      bad.once("connect_error", () => {
        clearTimeout(timer);
        resolve();
      });
      bad.connect();
    });
  } finally {
    good.disconnect();
    bad.disconnect();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("creates a room, persists identity, and consumes the invite after joining", async () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-auth-"));
  const app = await buildApp({
    dataDir: dir,
    publicOrigin: "http://localhost:5173",
  });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      payload: { displayName: "Ren", title: "Chat test" },
    });
    assert.equal(created.statusCode, 201);
    const createdBody = created.json() as {
      conversation: { locator: string };
      inviteLink: string;
      recoveryCode: string;
    };
    assert.match(
      createdBody.inviteLink,
      new RegExp("/c/" + createdBody.conversation.locator + "#i="),
    );
    assert.ok(createdBody.recoveryCode.length >= 20);
    const ownerCookie = String(created.headers["set-cookie"]).split(";")[0];
    const invite = new URL(createdBody.inviteLink);
    const joined = await app.inject({
      method: "POST",
      url: "/api/v1/conversations/join",
      payload: {
        locator: invite.pathname.split("/").pop(),
        inviteSecret: invite.hash.slice(3),
        displayName: "Angelo",
      },
    });
    assert.equal(joined.statusCode, 201);
    const memberCookie = String(joined.headers["set-cookie"]).split(";")[0];
    const ownerMe = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { cookie: ownerCookie },
    });
    assert.equal(ownerMe.json().member.displayName, "Ren");
    assert.equal(ownerMe.json().conversation.member.displayName, "Ren");
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/me",
          headers: { cookie: memberCookie },
        })
      ).json().member.displayName,
      "Angelo",
    );
    const ownerAgain = await app.inject({
      method: "POST",
      url: "/api/v1/conversations/join",
      payload: {
        locator: invite.pathname.split("/").pop(),
        inviteSecret: invite.hash.slice(3),
        displayName: "Ren",
      },
    });
    assert.equal(ownerAgain.statusCode, 200);
    assert.equal(ownerAgain.json().recognized, true);
    assert.equal(ownerAgain.json().conversation.member.role, "owner");
    const recovered = await app.inject({
      method: "POST",
      url: "/api/v1/conversations/recover",
      payload: {
        locator: createdBody.conversation.locator,
        recoveryCode: createdBody.recoveryCode,
      },
    });
    assert.equal(recovered.statusCode, 200);
    assert.equal(recovered.json().conversation.member.displayName, "Ren");
    const third = await app.inject({
      method: "POST",
      url: "/api/v1/conversations/join",
      payload: {
        locator: invite.pathname.split("/").pop(),
        inviteSecret: invite.hash.slice(3),
        displayName: "Third",
      },
    });
    assert.equal(third.statusCode, 404);
    assert.equal(third.json().error.code, "INVITE_INVALID");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("saved messages stay personal to the member who starred them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-saved-"));
  const app = await buildApp({
    dataDir: dir,
    publicOrigin: "http://localhost:5173",
  });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      payload: { displayName: "Ren", title: "Chat test" },
    });
    const ownerCookie = String(created.headers["set-cookie"]).split(";")[0];
    const invite = new URL(
      (created.json() as { inviteLink: string }).inviteLink,
    );
    const joined = await app.inject({
      method: "POST",
      url: "/api/v1/conversations/join",
      payload: {
        locator: invite.pathname.split("/").pop(),
        inviteSecret: invite.hash.slice(3),
        displayName: "Angelo",
      },
    });
    const memberCookie = String(joined.headers["set-cookie"]).split(";")[0];
    const sent = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/messages",
      headers: { cookie: ownerCookie },
      payload: { body: "Numero del dentista" },
    });
    const messageId = (sent.json() as { message: { id: string } }).message.id;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/messages/${messageId}/save`,
          headers: { cookie: ownerCookie },
          payload: {},
        })
      ).statusCode,
      422,
    );
    // Saving twice is idempotent and never duplicates the list entry.
    for (const _ of [0, 1])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/messages/${messageId}/save`,
            headers: { cookie: ownerCookie },
            payload: { saved: true },
          })
        ).statusCode,
        200,
      );
    const ownerSaved = await app.inject({
      method: "GET",
      url: "/api/v1/messages/saved",
      headers: { cookie: ownerCookie },
    });
    assert.equal(ownerSaved.json().items.length, 1);
    assert.equal(ownerSaved.json().items[0].id, messageId);
    assert.equal(ownerSaved.json().items[0].authorName, "Ren");
    assert.ok(ownerSaved.json().items[0].savedAt);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/messages/saved",
          headers: { cookie: memberCookie },
        })
      ).json().items.length,
      0,
    );
    const ownerTimeline = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      headers: { cookie: ownerCookie },
    });
    assert.equal(ownerTimeline.json().messages[0].saved, true);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/messages",
          headers: { cookie: memberCookie },
        })
      ).json().messages[0].saved,
      false,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/messages/${messageId}/save`,
          headers: { cookie: ownerCookie },
          payload: { saved: false },
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/messages/saved",
          headers: { cookie: ownerCookie },
        })
      ).json().items.length,
      0,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/messages/00000000-0000-4000-8000-000000000000/save",
          headers: { cookie: ownerCookie },
          payload: { saved: true },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/messages/saved",
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a quoted message without text is described by its own media", () => {
  assert.equal(previewText({ body: "Ciao", musicTitle: "Brano" }), "Ciao");
  assert.equal(previewText({ body: "", musicTitle: "Brano" }), "Brano");
  assert.equal(previewText({ body: "", attachmentMime: "image/png" }), "Foto");
  assert.equal(previewText({ body: "", attachmentMime: "video/mp4" }), "Video");
  assert.equal(
    previewText({ body: "", attachmentMime: "audio/mp4" }),
    "Messaggio vocale",
  );
  assert.equal(
    previewText({
      body: " ",
      attachmentMime: "application/pdf",
      attachmentFilename: "conto.pdf",
    }),
    "📎 conto.pdf",
  );
  assert.equal(previewText({ body: "" }), "Messaggio");
});

const BOUNDARY = "----privatechattest";

// Minimal multipart body: the upload handler reads the plain fields that
// precede the file part, so their order matters here.
function uploadBody(
  filename: string,
  mime: string,
  fields: Record<string, string> = {},
) {
  return Buffer.concat([
    ...Object.entries(fields).map((entry) =>
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${entry[0]}"\r\n\r\n${entry[1]}\r\n`,
      ),
    ),
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

test("replying to a photo quotes the photo, over the socket and after a reload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-reply-"));
  const origin = "http://localhost:5173";
  const app = await buildApp({ dataDir: dir, publicOrigin: origin });
  const url = await app.listen({ port: 0, host: "127.0.0.1" });
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/conversations",
    payload: { displayName: "Ren" },
  });
  const ownerCookie = String(created.headers["set-cookie"]).split(";")[0];
  const uploaded = await app.inject({
    method: "POST",
    url: "/api/v1/messages/attachment",
    headers: {
      cookie: ownerCookie,
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    },
    payload: uploadBody("foto.png", "image/png"),
  });
  assert.equal(uploaded.statusCode, 201);
  const photoId = (uploaded.json() as { id: string }).id;
  const socket = io(url, {
    transports: ["websocket"],
    extraHeaders: { origin, cookie: ownerCookie },
    reconnection: false,
    autoConnect: false,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Realtime timeout")),
        3000,
      );
      socket.once("service.ready", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("connect_error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.connect();
    });
    const sent = await new Promise<{
      message?: { replyTo?: { body: string } };
      error?: string;
    }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Send timeout")), 3000);
      socket.emit(
        "chat.message.send",
        { body: "Che bella", replyToId: photoId },
        (result: {
          message?: { replyTo?: { body: string } };
          error?: string;
        }) => {
          clearTimeout(timer);
          resolve(result);
        },
      );
    });
    assert.equal(sent.message?.replyTo?.body, "Foto");
    const timeline = await app.inject({
      method: "GET",
      url: "/api/v1/messages",
      headers: { cookie: ownerCookie },
    });
    const quoted = (
      timeline.json() as { messages: Array<{ replyTo?: { body: string } }> }
    ).messages.find((message) => message.replyTo);
    assert.equal(quoted?.replyTo?.body, "Foto");
  } finally {
    socket.disconnect();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the saved list carries media to show, but never a view-once attachment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "private-chat-saved-media-"));
  const app = await buildApp({
    dataDir: dir,
    publicOrigin: "http://localhost:5173",
  });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      payload: { displayName: "Ren" },
    });
    const cookie = String(created.headers["set-cookie"]).split(";")[0];
    const upload = async (
      filename: string,
      mime: string,
      viewOnce?: boolean,
    ) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/messages/attachment",
        headers: {
          cookie,
          "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
        },
        payload: uploadBody(filename, mime, viewOnce ? { viewOnce: "1" } : {}),
      });
      assert.equal(response.statusCode, 201);
      const id = (response.json() as { id: string }).id;
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/messages/${id}/save`,
            headers: { cookie },
            payload: { saved: true },
          })
        ).statusCode,
        200,
      );
      return id;
    };
    const photo = await upload("foto.png", "image/png");
    const secret = await upload("segreto.png", "image/png", true);
    const items = (
      await app.inject({
        method: "GET",
        url: "/api/v1/messages/saved",
        headers: { cookie },
      })
    ).json().items as Array<{
      id: string;
      attachmentId: string | null;
      attachmentMime: string | null;
    }>;
    assert.equal(items.length, 2);
    const saved = items.find((item) => item.id === photo);
    assert.equal(saved?.attachmentMime, "image/png");
    assert.ok(saved?.attachmentId, "a regular photo is renderable in the list");
    // Rendering this one would consume it before it is ever opened.
    assert.equal(
      items.find((item) => item.id === secret)?.attachmentId,
      null,
      "a view-once photo must not be renderable in the list",
    );
    // The attachment id the list hands over really serves the media.
    const media = await app.inject({
      method: "GET",
      url: `/media/${saved?.attachmentId}`,
      headers: { cookie },
    });
    assert.equal(media.statusCode, 200);
    assert.equal(media.headers["content-type"], "image/png");
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
