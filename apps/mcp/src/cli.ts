#!/usr/bin/env node
const command = process.argv[2] ?? "serve";

if (command === "setup") {
  await import("./setup.js");
} else if (command === "serve") {
  await import("./index.js");
} else {
  console.error("Uso: private-chat-mcp setup | private-chat-mcp serve");
  process.exitCode = 2;
}
