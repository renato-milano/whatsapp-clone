import { buildApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();
const app = await buildApp({ ...config, logger: true });
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    try {
      await app.close();
    } catch {
      process.exitCode = 1;
    }
  });
}
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
