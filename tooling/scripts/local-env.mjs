import { readFileSync } from "node:fs";

export function readLocalEnvironment(overrides = {}) {
  const fromFile = {};
  let contents = "";
  try { contents = readFileSync(".env", "utf8"); }
  catch { /* An absent .env is allowed for commands that do not need local services. */ }
  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fromFile[match[1]] = value;
  }
  // Explicit shell values take precedence over the local file, matching Compose and Node env-file behavior.
  return { ...fromFile, ...process.env, ...overrides };
}
