import { spawn } from "node:child_process";
import { readLocalEnvironment } from "./local-env.mjs";

const app = process.argv[2];
const allowed = new Set(["lending-web", "admin-web", "lending-api", "integrations-api"]);
if (!app || !allowed.has(app)) throw new Error("Usage: pnpm dev:<lending-web|admin-web|lending-api|integrations-api>");

const child = spawn("pnpm", ["--filter", `@vnext/${app}`, "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: readLocalEnvironment({ APP_ENV: "local" }),
});
const shutdown = () => child.kill("SIGINT");
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
