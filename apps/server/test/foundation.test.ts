import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io } from "socket.io-client";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/database.js";

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
      6,
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
        path === "/api/v1/messages" ? 401 : 404,
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
