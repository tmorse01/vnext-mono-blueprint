import { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import { createApplication } from '@vnext/server-platform';
import { LocalFlagProvider, SafeFlagProvider, type FlagProvider } from '@vnext/server-platform/flags';
import type { Database } from '@vnext/db/types';
import { originProtection, resolveBusinessUnit } from './auth.js';
import { actorResolver, apiRoutes } from './routes.js';

export function createLendingApi(db: Kysely<Database>, env: NodeJS.ProcessEnv = process.env, configuredFlags?: FlagProvider) {
  if (env.APP_ENV === 'production' && !env.APP_ALLOWED_ORIGINS?.trim()) throw new Error('APP_ALLOWED_ORIGINS must be configured in production.');
  if (env.APP_ENV === 'production' && !configuredFlags) throw new Error('A production feature-flag provider must be supplied; local flags are not used in production.');
  const flags = configuredFlags ?? new SafeFlagProvider(new LocalFlagProvider({ illustrativePricing: env.ILLUSTRATIVE_PRICING !== 'false' }));
  const routes = Router();
  routes.use(originProtection(env));
  routes.use('/api', apiRoutes(db, env, flags));
  const app = createApplication({
    app: 'lending-api', environment: env.APP_ENV ?? 'local', version: env.APP_VERSION ?? '0.1.0',
    resolveActor: actorResolver(db, env),
    resolveBusinessUnit: (request) => resolveBusinessUnit(db, request),
    readiness: async () => {
      try { await sql`SELECT 1 as ready`.execute(db); return true; } catch { return false; }
    },
    routes,
  });
  return app;
}
