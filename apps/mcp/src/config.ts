import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const configSchema = z
  .object({
    chatLink: z.string(),
    displayName: z.string().trim().min(1).max(50),
  })
  .strict();
export type ChatConfig = z.infer<typeof configSchema>;

export function configPath() {
  return (
    process.env.PRIVATE_CHAT_MCP_CONFIG ??
    join(homedir(), ".config", "private-chat-mcp", "config.json")
  );
}

export function parseConfig(value: unknown): ChatConfig {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "Configurazione non valida. Esegui di nuovo il setup del connettore.",
    );
  try {
    const url = new URL(parsed.data.chatLink);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      !/^\/c\/[A-Za-z0-9_-]{16,64}$/.test(url.pathname) ||
      !/^#i=[A-Za-z0-9_-]{20,128}$/.test(url.hash)
    )
      throw new Error();
    return { ...parsed.data, chatLink: url.href };
  } catch {
    throw new Error(
      "Inserisci il link di invito completo con #i=…; HTTPS richiesto salvo localhost.",
    );
  }
}

export async function loadConfig(path = configPath()) {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(
      "Configurazione assente o illeggibile. Esegui prima il setup del connettore.",
    );
  }
  return parseConfig(value);
}

export async function saveConfig(value: ChatConfig, path = configPath()) {
  const config = parseConfig(value);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await chmod(temp, 0o600);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
