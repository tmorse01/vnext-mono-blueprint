import { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import { createApplication, HttpProblem } from '@vnext/server-platform';
import type { Database } from '@vnext/db/types';
import { callbackRouter, createSqlDeliveryStore } from './callback.js';

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.length < 32) throw new Error(`${name} must be configured with at least 32 characters.`);
  return value;
}

export function createIntegrationsApi(db: Kysely<Database>, env: NodeJS.ProcessEnv = process.env, fetcher?: typeof fetch) {
  const callbackSecret = required(env, 'MOCK_PROVIDER_CALLBACK_SECRET');
  const serviceToken = required(env, 'LENDING_API_SERVICE_TOKEN');
  const lendingApiUrl = env.LENDING_API_BASE_URL ?? 'http://localhost:3001';
  let lendingUrl: URL;
  try { lendingUrl = new URL(lendingApiUrl); } catch { throw new Error('LENDING_API_BASE_URL must be an absolute URL.'); }
  if (!['http:', 'https:'].includes(lendingUrl.protocol) || (env.APP_ENV === 'production' && lendingUrl.protocol !== 'https:')) {
    throw new Error('LENDING_API_BASE_URL must use HTTP locally and HTTPS in production.');
  }
  const routes = Router();
  routes.use('/api', callbackRouter({ store: createSqlDeliveryStore(db), callbackSecret, serviceToken, lendingApiUrl, ...(fetcher ? { fetcher } : {}) }));
  return createApplication({
    app: 'integrations-api', environment: env.APP_ENV ?? 'local', version: env.APP_VERSION ?? '0.1.0',
    routes,
    readiness: async () => {
      try { await sql`SELECT 1 as ready`.execute(db); return true; } catch { return false; }
    },
  });
}
