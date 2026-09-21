import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ChatClient } from "./client.js";
import { createMcpServer } from "./server.js";

try {
  const server = createMcpServer(new ChatClient(await loadConfig()));
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Avvio MCP non riuscito.",
  );
  process.exitCode = 1;
}
