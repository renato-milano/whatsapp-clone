import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

export const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function readConfig() {
  loadEnv({ path: resolve(projectRoot, ".env"), quiet: true });
  const production = process.env.NODE_ENV === "production";
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  if (production && !process.env.PUBLIC_ORIGIN)
    throw new Error("PUBLIC_ORIGIN is required in production");
  if (production && !process.env.DATA_DIR)
    throw new Error("DATA_DIR is required in production");
  const origin = new URL(process.env.PUBLIC_ORIGIN ?? "http://localhost:5173");
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error(
      "PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials",
    );
  }
  if (production && origin.protocol !== "https:")
    throw new Error("Production requires an HTTPS PUBLIC_ORIGIN");
  return {
    host: process.env.HOST ?? (production ? "0.0.0.0" : "127.0.0.1"),
    port,
    publicOrigin: origin.origin,
    dataDir: resolve(projectRoot, process.env.DATA_DIR ?? "./data"),
    staticRoot: production ? resolve(projectRoot, "apps/web/dist") : undefined,
  };
}
