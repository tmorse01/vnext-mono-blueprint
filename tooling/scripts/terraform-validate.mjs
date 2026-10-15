import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const environmentsRoot = join(root, 'infrastructure', 'terraform', 'environments');
const environments = (await readdir(environmentsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(environmentsRoot, entry.name));

if (environments.length === 0) {
  console.error(`No Terraform environments found under ${environmentsRoot}`);
  process.exitCode = 1;
} else {
  let failed = false;
  for (const directory of environments) {
    const name = directory.slice(environmentsRoot.length + 1);
    console.log(`Validating ${name} (backend disabled; no plan or apply)`);
    const init = spawnSync('terraform', ['init', '-backend=false', '-input=false', '-no-color'], {
      cwd: directory,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (init.error) {
      console.error(`Terraform init could not run for ${name}: ${init.error.message}`);
      failed = true;
      continue;
    }
    if (init.status !== 0) {
      console.error(`Terraform init failed for ${name}. Provider download or network access may be unavailable.`);
      failed = true;
      continue;
    }
    const validation = spawnSync('terraform', ['validate', '-no-color'], {
      cwd: directory,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (validation.error || validation.status !== 0) {
      console.error(`Terraform validate failed for ${name}${validation.error ? `: ${validation.error.message}` : ''}`);
      failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}
