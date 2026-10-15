import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { readLocalEnvironment } from "./local-env.mjs";

const envPath = ".env";
const templatePath = ".env.example";
if (!existsSync(envPath)) writeFileSync(envPath, readFileSync(templatePath, "utf8"), { flag: "wx" });

const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const configuredEmail = lines.find((line) => line.startsWith("LOCAL_USER_EMAIL="))?.slice("LOCAL_USER_EMAIL=".length).trim();
const values = {
  APP_ENV: "local",
  DB_SERVER: "localhost",
  DB_PORT: "1433",
  DB_NAME: "VNextReference",
  DB_USER: "sa",
  DB_PASSWORD: randomBytes(24).toString("base64url"),
  SQLSERVER_ACCEPT_EULA: "Y",
  LENDING_API_SERVICE_TOKEN: randomBytes(32).toString("base64url"),
  MOCK_PROVIDER_CALLBACK_SECRET: randomBytes(32).toString("base64url"),
  APP_ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:5174",
  LENDING_API_BASE_URL: "http://localhost:3001",
  LOCAL_USER_EMAIL: "developer@vnext.test",
  LOCAL_USER_PASSWORD: randomBytes(24).toString("base64url"),
  VITE_LOCAL_USER_EMAIL: configuredEmail || "developer@vnext.test",
  INTEGRATIONS_API_PORT: "3002",
  LENDING_API_PORT: "3001",
  LENDING_WEB_PORT: "5173",
  ADMIN_WEB_PORT: "5174",
  TELEMETRY_MODE: "console",
};
const remaining = new Map(Object.entries(values));
let generatedLocalPassword;
const merged = lines.map((line) => {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!match) return line;
  const generated = remaining.get(match[1]);
  if (generated === undefined) return line;
  remaining.delete(match[1]);
  if (match[2]) return line;
  if (match[1] === "LOCAL_USER_PASSWORD") generatedLocalPassword = generated;
  return `${match[1]}=${generated}`;
});
for (const [key, value] of remaining) {
  merged.push(`${key}=${value}`);
  if (key === "LOCAL_USER_PASSWORD") generatedLocalPassword = value;
}
writeFileSync(envPath, `${merged.join("\n").trimEnd()}\n`, "utf8");
const localUserEmail = merged.find((line) => line.startsWith("LOCAL_USER_EMAIL="))?.slice("LOCAL_USER_EMAIL=".length) ?? values.LOCAL_USER_EMAIL;
const childEnvironment = readLocalEnvironment({ APP_ENV: "local" });

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" && command === "pnpm", env: childEnvironment });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? "no status"}`);
}

run("docker", ["compose", "--env-file", envPath, "-f", "infrastructure/compose.yaml", "up", "-d", "sqlserver"]);
let healthy = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const result = spawnSync("docker", ["compose", "--env-file", envPath, "-f", "infrastructure/compose.yaml", "ps", "--format", "json", "sqlserver"], { encoding: "utf8", env: childEnvironment });
  if (result.status !== 0) throw new Error(result.stderr || "Unable to inspect SQL Server readiness.");
  try {
    const containers = result.stdout.trim().startsWith("[") ? JSON.parse(result.stdout) : [JSON.parse(result.stdout)];
    if (containers.some((container) => container.Health === "healthy" || container.State === "running" && container.Health === undefined)) {
      healthy = true;
      break;
    }
  } catch {
    // Compose can briefly emit an empty line while the service starts.
  }
  await delay(2_000);
}
if (!healthy) throw new Error("SQL Server did not become healthy within 120 seconds. Check Docker Desktop and `docker compose logs sqlserver`.");
run("pnpm", ["db:migrate"]);
run("pnpm", ["db:seed"]);
run("pnpm", ["--filter", "@vnext/lending-api", "build"]);
run("pnpm", ["--filter", "@vnext/lending-api", "provision:local-user"]);
console.log("Local configuration, SQL Server, migrations, seeds, and the synthetic developer account are ready.");
if (generatedLocalPassword) console.log(`Local sign-in: ${localUserEmail} / ${generatedLocalPassword}`);
