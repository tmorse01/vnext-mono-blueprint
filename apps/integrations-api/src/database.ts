import { createDatabase } from '@vnext/db';

/** Build an integrations-only connection, falling back to the common local DB settings. */
export function integrationsDatabaseEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const prefix = 'INTEGRATIONS';
  const dedicatedUrl = env[`${prefix}_DB_URL`];
  if (dedicatedUrl) return { ...env, DB_URL: dedicatedUrl };

  const user = env[`${prefix}_DB_USER`];
  const password = env[`${prefix}_DB_PASSWORD`];
  if (!user && !password) return env;
  if (!user || !password) throw new Error(`${prefix}_DB_USER and ${prefix}_DB_PASSWORD must be configured together.`);

  if (env.DB_URL) {
    const url = new URL(env.DB_URL);
    if (url.protocol !== 'mssql:') throw new Error('DB_URL protocol must be mssql:.');
    url.username = user;
    url.password = password;
    return { ...env, DB_URL: url.toString() };
  }
  return { ...env, DB_USER: user, DB_PASSWORD: password };
}

export function createIntegrationsDatabase(env: NodeJS.ProcessEnv = process.env) {
  return createDatabase(integrationsDatabaseEnvironment(env));
}
