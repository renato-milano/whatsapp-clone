import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { configPath, parseConfig, saveConfig } from "./config.js";
import { ChatClient } from "./client.js";

let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const terminal = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
try {
  process.stdout.write("Link completo della chat (input nascosto): ");
  hidden = true;
  const chatLink = (await terminal.question("")).trim();
  hidden = false;
  process.stdout.write("\n");
  const displayName = await terminal.question("Nome utente esistente: ");
  const config = parseConfig({ chatLink, displayName });
  await new ChatClient(config).request("/api/v1/me");
  await saveConfig(config);
  console.log(
    `Collegamento verificato. Configurazione salvata in ${configPath()}`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Configurazione non riuscita.",
  );
  process.exitCode = 1;
} finally {
  terminal.close();
}
