import { createIntegrationsApi } from './app.js';
import { createIntegrationsDatabase } from './database.js';

const db = createIntegrationsDatabase();
const app = createIntegrationsApi(db);
const port = Number(process.env.INTEGRATIONS_API_PORT ?? 3002);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('INTEGRATIONS_API_PORT is invalid.');
const server = app.listen(port, () => console.info(JSON.stringify({ event: 'server.started', app: 'integrations-api', port })));
let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.info(JSON.stringify({ event: 'server.shutdown', app: 'integrations-api', signal }));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await db.destroy();
}
process.once('SIGINT', () => { void shutdown('SIGINT').then(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown('SIGTERM').then(() => process.exit(0)); });
