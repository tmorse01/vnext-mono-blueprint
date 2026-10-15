import { createMigrator } from './migrate.js';
import { seedDevelopmentData } from './seeds/development.js';
import { checkSchema } from './schema-check.js';

const command = process.argv[2];

async function main(): Promise<void> {
  const { db, migrator } = createMigrator();
  try {
    if (command === 'migrate') {
      const { error, results } = await migrator.migrateToLatest();
      for (const result of results ?? []) console.info(`${result.status}: ${result.migrationName}`);
      if (error) throw error;
    } else if (command === 'seed') {
      await seedDevelopmentData(db);
      console.info('Synthetic development data is ready.');
    } else if (command === 'schema:check') {
      await checkSchema(db);
      console.info('Database table and column catalog matches the committed schema manifest.');
    } else if (command === 'reset') {
      if (process.env.DB_ALLOW_RESET !== 'true' || process.env.NODE_ENV === 'production') {
        throw new Error('Reset is destructive. Set DB_ALLOW_RESET=true outside production to confirm.');
      }
      const { error, results } = await migrator.migrateDown();
      for (const result of results ?? []) console.info(`${result.status}: ${result.migrationName}`);
      if (error) throw error;
      console.info('Database schema reset completed.');
    } else {
      throw new Error('Usage: node dist/cli.js <migrate|seed|reset>');
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown database command failure.';
  console.error(message);
  process.exitCode = 1;
});
