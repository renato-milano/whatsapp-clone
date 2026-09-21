import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { io } from "socket.io-client";
import { buildApp } from "../../server/src/app.js";
import { openDatabase } from "../../server/src/database.js";
import { ChatClient } from "../src/client.js";
import { loadConfig, parseConfig, saveConfig } from "../src/config.js";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "chat-mcp-test-"));
  const app = await buildApp({
    dataDir: dir,
    publicOrigin: "http://127.0.0.1",
  });
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  const created = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      payload: { displayName: "Renato" },
    })
  ).json();
  const url = new URL(created.inviteLink);
  const config = {
    chatLink: origin + url.pathname + url.hash,
    displayName: "Renato",
  };
  const credentials = {
    locator: created.conversation.locator,
    inviteSecret: url.hash.slice(3),
    displayName: "Renato",
  };
  return {
    dir,
    app,
    origin,
    config,
    credentials,
    memberId: created.conversation.member.id,
    close: async () => {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("configuration is private, shared across restarts, and rejects incomplete/insecure links", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chat-mcp-config-"));
  try {
    const path = join(dir, "private", "config.json");
    const config = {
      chatLink: "https://chat.example/c/abcdefghijklmnop#i=" + "s".repeat(32),
      displayName: "Renato",
    };
    await saveConfig(config, path);
    assert.deepEqual(await loadConfig(path), config);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(join(dir, "private"))).mode & 0o777, 0o700);
    await saveConfig({ ...config, displayName: "Giada" }, path);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(
      Object.keys(JSON.parse(await readFile(path, "utf8"))).sort(),
      ["chatLink", "displayName"],
    );
    for (const chatLink of [
      config.chatLink.split("#")[0],
      config.chatLink.replace("https:", "http:"),
      config.chatLink.replace("chat.example", "user:pass@chat.example"),
    ])
      assert.throws(() => parseConfig({ ...config, chatLink }));
    await writeFile(path, "broken");
    await assert.rejects(loadConfig(path), /Configurazione/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP login requires the invite secret and an existing member, without occupying a slot", async () => {
  const f = await fixture();
  try {
    const login = (payload: unknown) =>
      f.app.inject({ method: "POST", url: "/api/v1/mcp/connect", payload });
    assert.equal(
      (await login({ ...f.credentials, displayName: "Typo" })).statusCode,
      404,
    );
    assert.equal(
      (await login({ ...f.credentials, inviteSecret: "x".repeat(32) }))
        .statusCode,
      404,
    );
    const second = await f.app.inject({
      method: "POST",
      url: "/api/v1/conversations/join",
      payload: { ...f.credentials, displayName: "Giada" },
    });
    assert.equal(second.statusCode, 201);
    const recognized = await login({ ...f.credentials, displayName: "renato" });
    assert.equal(recognized.statusCode, 200);
    assert.equal(recognized.json().conversation.member.id, f.memberId);
    assert.equal((await f.app.inject("/api/v1/mcp/messages")).statusCode, 401);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/mcp/messages",
          payload: { body: "hello" },
        })
      ).statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});

test("read/search pagination, room isolation, reply validation, realtime, and session renewal", async () => {
  const f = await fixture();
  const socket = io(f.origin, {
    autoConnect: false,
    transports: ["websocket"],
  });
  try {
    const client = new ChatClient(f.config);
    const login = await f.app.inject({
      method: "POST",
      url: "/api/v1/mcp/connect",
      payload: f.credentials,
    });
    socket.io.opts.extraHeaders = {
      Cookie: String(login.headers["set-cookie"]).split(";")[0]!,
    };
    await new Promise<void>((resolve, reject) => {
      socket.once("service.ready", () => resolve());
      socket.once("connect_error", reject);
      socket.connect();
    });
    const realtime = new Promise<any>((resolve) =>
      socket.once("chat.message.created", resolve),
    );
    const first = await client.request<any>("/api/v1/mcp/messages", {
      body: "first match",
    });
    assert.equal((await realtime).memberId, f.memberId);
    assert.equal(first.message.authorName, "Renato");
    await client.request("/api/v1/mcp/messages", {
      body: "second match",
      replyToId: first.message.id,
    });
    await client.request("/api/v1/mcp/messages", { body: "third unrelated" });
    const db = openDatabase(f.dir);
    db.prepare(
      "UPDATE messages SET created_at = '2026-09-21T00:00:00.000Z'",
    ).run();
    const firstPage = await client.read({ after: 0, limit: 1 });
    assert.equal(firstPage.messages[0]?.body, "first match");
    assert.equal(firstPage.hasMore, true);
    const next = await client.read({ after: firstPage.latestCursor });
    assert.deepEqual(
      next.messages.map((m) => m.body),
      ["second match", "third unrelated"],
    );
    const newest = await client.read({ limit: 1 });
    assert.equal(newest.messages[0]?.body, "third unrelated");
    const older = await client.read({ before: newest.oldestCursor!, limit: 2 });
    assert.equal(older.messages.length, 2);
    assert.equal((await client.read({ q: "match" })).messages.length, 2);
    assert.equal((await client.read({ q: "%" })).messages.length, 0);
    await assert.rejects(client.read({ after: 0, before: 3 }), /422/);
    await assert.rejects(
      client.request("/api/v1/mcp/messages", { body: " " }),
      /422/,
    );
    await assert.rejects(
      client.request("/api/v1/mcp/messages", { body: "x".repeat(4001) }),
      /422/,
    );
    const other = (
      await f.app.inject({
        method: "POST",
        url: "/api/v1/conversations",
        payload: { displayName: "Other" },
      })
    ).json();
    const otherUrl = new URL(other.inviteLink);
    const otherClient = new ChatClient({
      chatLink: f.origin + otherUrl.pathname + otherUrl.hash,
      displayName: "Other",
    });
    const privateMessage = await otherClient.request<any>(
      "/api/v1/mcp/messages",
      { body: "private" },
    );
    await assert.rejects(
      client.request("/api/v1/mcp/messages", {
        body: "bad reply",
        replyToId: privateMessage.message.id,
      }),
      /404/,
    );
    assert.equal((await client.read({ q: "private" })).messages.length, 0);
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00Z'").run();
    const status = await client.request<any>("/api/v1/me");
    assert.equal(status.member.id, f.memberId);
    db.close();
    const waiting = client.wait(newest.latestCursor, 3);
    await client.request("/api/v1/mcp/messages", { body: "new arrival" });
    assert.equal((await waiting).messages[0]?.body, "new arrival");
    const end = (await client.read()).latestCursor;
    assert.equal((await client.wait(end, 1)).messages.length, 0);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(client.wait(end, 20, abort.signal));
  } finally {
    socket.disconnect();
    await f.close();
  }
});

test("MCP stdio handshake and tools work end to end without exposing credentials", async () => {
  const f = await fixture();
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  const path = join(f.dir, "config.json");
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", resolve(root, "apps/mcp/src/index.ts")],
    cwd: root,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      PRIVATE_CHAT_MCP_CONFIG: path,
    },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    await saveConfig(f.config, path);
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((t) => t.name).sort(), [
      "chat_read",
      "chat_search",
      "chat_send",
      "chat_status",
      "chat_wait",
    ]);
    const status = await client.callTool({ name: "chat_status" });
    assert.equal(status.isError, undefined);
    assert.ok(!JSON.stringify(status).includes(f.credentials.inviteSecret));
    assert.ok(!JSON.stringify(status).includes("chat_session"));
    const sent = await client.callTool({
      name: "chat_send",
      arguments: { body: "Hello through MCP" },
    });
    assert.equal(sent.isError, undefined);
    const read = await client.callTool({ name: "chat_read", arguments: {} });
    assert.match(JSON.stringify(read), /Hello through MCP/);
    const invalid = await client.callTool({
      name: "chat_send",
      arguments: { body: "" },
    });
    assert.equal(invalid.isError, true);
    const failedReply = await client.callTool({
      name: "chat_send",
      arguments: { body: "reply", replyToId: "missing" },
    });
    assert.equal(failedReply.isError, true);
    assert.ok(!stderr.includes(f.credentials.inviteSecret));
  } finally {
    await client.close();
    await transport.close();
    await f.close();
  }
});
