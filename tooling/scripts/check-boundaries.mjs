import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const violations = [];
const importPattern = /(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)["']([^"']+)["']/g;

async function filesUnder(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function checkSpecifier(file, specifier) {
  const rel = relative(root, file).split(sep).join("/");
  const isBrowser = rel.startsWith("apps/lending-web/") || rel.startsWith("apps/admin-web/");
  const isContracts = rel.startsWith("packages/contracts/") || rel.startsWith("packages/metadata/");
  const isClient = rel.startsWith("packages/api-client/");
  const browserForbidden = /^(?:node:|@vnext\/(?:db|server-platform)(?:\/|$)|(?:express|kysely|tedious|pino)(?:\/|$))/;
  const portableForbidden = /^(?:react|react-dom|express|kysely|tedious|pino)(?:\/|$)|^@vnext\/(?:db|server-platform)(?:\/|$)/;
  const clientForbidden = /^(?:node:|express|kysely|tedious|pino)(?:\/|$)|^@vnext\/(?:db|server-platform)(?:\/|$)|^apps\//;
  if (isBrowser && browserForbidden.test(specifier)) violations.push(`${rel}: browser code imports server-only module "${specifier}"`);
  if (isContracts && portableForbidden.test(specifier)) violations.push(`${rel}: portable package imports framework/server module "${specifier}"`);
  if (isClient && clientForbidden.test(specifier)) violations.push(`${rel}: api-client imports server/app module "${specifier}"`);
  if (specifier.startsWith("apps/")) violations.push(`${rel}: application source imports another application "${specifier}"`);
}

for (const directory of ["apps", "packages"]) {
  for (const file of await filesUnder(join(root, directory))) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(importPattern)) checkSpecifier(file, match[1]);
  }
}

if (violations.length) {
  console.error(`Architecture boundary violations:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries passed.");
}
