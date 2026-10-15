import { FileMigrationProvider, Migrator } from 'kysely';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from './connection.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createMigrator() {
  const db = createDatabase();
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder: path.join(here, 'migrations') }),
    migrationTableName: 'vnext_migration',
    migrationLockTableName: 'vnext_migration_lock',
  });
  return { db, migrator };
}

