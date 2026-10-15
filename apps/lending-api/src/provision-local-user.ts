import { createLendingDatabase } from './database.js';
import { localUserProvisioningAllowed, provisionLocalUser } from './routes.js';

if (!localUserProvisioningAllowed(process.env)) throw new Error('Local user provisioning is available only when APP_ENV=local and NODE_ENV is not production.');
const email = process.env.LOCAL_USER_EMAIL;
const password = process.env.LOCAL_USER_PASSWORD;
if (!email || !password) throw new Error('Set LOCAL_USER_EMAIL and LOCAL_USER_PASSWORD before running provision:local-user.');
const db = createLendingDatabase();
try {
  await provisionLocalUser(db, email, password);
  console.info('Local developer account provisioned.');
} finally {
  await db.destroy();
}
