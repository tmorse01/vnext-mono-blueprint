import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { readLocalEnvironment } from "./local-env.mjs";

const useShell = process.platform === "win32";
const setup = spawnSync("pnpm", ["setup:local"], { stdio: "inherit", shell: useShell });
if (setup.error) throw setup.error;
if (setup.status !== 0) process.exit(setup.status ?? 1);

const child = spawn("pnpm", ["exec", "turbo", "dev"], { stdio: "inherit", shell: useShell, env: readLocalEnvironment({ APP_ENV: "local" }) });
const shutdown = () => child.kill("SIGINT");
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
