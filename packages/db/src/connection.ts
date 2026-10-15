import { Kysely, MssqlDialect } from 'kysely';
import * as Tarn from 'tarn';
import * as tedious from 'tedious';
import type { Database } from './types/database.js';

type ConnectionOptions = ConstructorParameters<typeof tedious.Connection>[0];

function boolValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('DB_ENCRYPT and DB_TRUST_SERVER_CERTIFICATE must be true or false.');
}

function connectionOptions(env: NodeJS.ProcessEnv): ConnectionOptions {
  const encrypt = boolValue(env.DB_ENCRYPT, true);
  const trustServerCertificate = boolValue(env.DB_TRUST_SERVER_CERTIFICATE, false);
  const connectTimeout = Number(env.DB_CONNECT_TIMEOUT_MS ?? 15_000);
  const requestTimeout = Number(env.DB_REQUEST_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(connectTimeout) || connectTimeout < 1_000 || connectTimeout > 120_000) {
    throw new Error('DB_CONNECT_TIMEOUT_MS must be an integer from 1000 through 120000.');
  }
  if (!Number.isInteger(requestTimeout) || requestTimeout < 1_000 || requestTimeout > 300_000) {
    throw new Error('DB_REQUEST_TIMEOUT_MS must be an integer from 1000 through 300000.');
  }

  let server = env.DB_SERVER;
  let database = env.DB_NAME;
  let port = Number(env.DB_PORT ?? 1433);
  let user = env.DB_USER;
  let password = env.DB_PASSWORD;

  // Accept the conventional mssql://user:password@host:port/database URL without logging it.
  if (env.DB_URL) {
    let url: URL;
    try {
      url = new URL(env.DB_URL);
    } catch {
      throw new Error('DB_URL must be a valid mssql:// connection URL.');
    }
    if (url.protocol !== 'mssql:') throw new Error('DB_URL protocol must be mssql:.');
    server = url.hostname;
    database = decodeURIComponent(url.pathname.replace(/^\//u, ''));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    if (url.port) port = Number(url.port);
  }

  if (!server || !database || !user || !password) {
    throw new Error('Configure DB_URL or DB_SERVER, DB_NAME, DB_USER, and DB_PASSWORD.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('DB_PORT is invalid.');

  return {
    server,
    authentication: { type: 'default', options: { userName: user, password } },
    options: {
      port,
      database,
      encrypt,
      trustServerCertificate,
      connectTimeout,
      requestTimeout,
      useUTC: true,
      rowCollectionOnRequestCompletion: false,
    },
  };
}

export function createDatabase(env: NodeJS.ProcessEnv = process.env): Kysely<Database> {
  const poolMax = Number(env.DB_POOL_MAX ?? 10);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 50) {
    throw new Error('DB_POOL_MAX must be an integer from 1 through 50.');
  }
  return new Kysely<Database>({
    dialect: new MssqlDialect({
      tarn: {
        ...Tarn,
        options: { min: 0, max: poolMax },
      },
      tedious: {
        ...tedious,
        connectionFactory: () => new tedious.Connection(connectionOptions(env)),
      },
    }),
  });
}

