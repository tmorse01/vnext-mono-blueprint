import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readLocalEnvironment } from "./local-env.mjs";

if (!process.argv.includes("--confirm")) {
  const terminal = createInterface({ input: stdin, output: stdout });
  const answer = await terminal.question("This deletes the local VNextReference database. Type RESET to continue: ");
  terminal.close();
  if (answer !== "RESET") {
    console.log("Database reset cancelled.");
    process.exit(0);
  }
}

const shell = process.platform === "win32";
const childEnvironment = readLocalEnvironment({ DB_ALLOW_RESET: "true" });
const commands = [
  ["--filter", "@vnext/db", "build"],
  ["--filter", "@vnext/db", "reset", "--", "--confirm"],
  ["db:migrate"],
  ["db:seed"],
];
for (const command of commands) {
  const result = spawnSync("pnpm", command, { stdio: "inherit", shell, env: childEnvironment });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
