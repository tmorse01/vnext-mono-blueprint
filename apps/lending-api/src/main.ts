import { createLendingApi } from './app.js';
import { createLendingDatabase } from './database.js';

const db = createLendingDatabase();
const app = createLendingApi(db);
const port = Number(process.env.LENDING_API_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('LENDING_API_PORT is invalid.');
const server = app.listen(port, () => console.info(JSON.stringify({ event: 'server.started', app: 'lending-api', port })));

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.info(JSON.stringify({ event: 'server.shutdown', app: 'lending-api', signal }));
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await db.destroy();
}
process.once('SIGINT', () => { void shutdown('SIGINT').then(() => process.exit(0)); });
process.once('SIGTERM', () => { void shutdown('SIGTERM').then(() => process.exit(0)); });
