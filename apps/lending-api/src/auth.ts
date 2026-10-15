import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import type { Kysely } from 'kysely';
import type { Request, RequestHandler } from 'express';
import type { Database } from '@vnext/db/types';
import type { Actor } from '@vnext/server-platform/context';
import { HttpProblem } from '@vnext/server-platform/errors';

export const SESSION_COOKIE = 'vnext_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SERVICE_ACTOR_ID = '00000000-0000-4000-8000-000000000900';

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.header('cookie');
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(pair.slice(separator + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function bearerToken(request: Request): string | undefined {
  const header = request.header('authorization');
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice(7);
}

function isIntegrationDecisionRequest(request: Request): boolean {
  return request.method === 'POST' && request.originalUrl.split('?')[0] === '/api/scenarios/internal/integration-events';
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function resolveActor(db: Kysely<Database>, request: Request, env: NodeJS.ProcessEnv): Promise<Actor | undefined> {
  const serviceToken = env.LENDING_API_SERVICE_TOKEN;
  const suppliedBearer = bearerToken(request);
  if (serviceToken && suppliedBearer && safeEqual(suppliedBearer, serviceToken) && isIntegrationDecisionRequest(request)) {
    return { id: SERVICE_ACTOR_ID, type: 'service', permissions: new Set(['scenarios.write']) };
  }

  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return undefined;
  const session = await db.selectFrom('iam.UserSession as s')
    .innerJoin('iam.AppUser as u', 'u.id', 's.userId')
    .select(['s.userId', 'u.isActive'])
    .where('s.tokenHash', '=', hashSessionToken(token))
    .where('s.revokedAt', 'is', null)
    .where('s.expiresAt', '>', new Date())
    .executeTakeFirst();
  if (!session || !session.isActive) return undefined;

  const permissionRows = await db.selectFrom('iam.UserRole as ur')
    .innerJoin('iam.RolePermission as rp', 'rp.roleId', 'ur.roleId')
    .innerJoin('iam.Permission as p', 'p.id', 'rp.permissionId')
    .select('p.key')
    .where('ur.userId', '=', session.userId)
    .execute();
  return { id: session.userId, type: 'user', permissions: new Set(permissionRows.map((row) => row.key)) };
}

export async function resolveBusinessUnit(db: Kysely<Database>, request: Request): Promise<string | undefined> {
  const selected = request.header('x-business-unit-id');
  if (!selected) return undefined;
  const parsed = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(selected);
  if (!parsed) throw new HttpProblem(400, 'validation_failed', 'The selected business unit is invalid.');
  const unit = await db.selectFrom('core.BusinessUnit').select('id').where('id', '=', selected).where('isActive', '=', true).executeTakeFirst();
  if (!unit) throw new HttpProblem(400, 'validation_failed', 'The selected business unit is unavailable.');
  return unit.id;
}

export function originProtection(env: NodeJS.ProcessEnv): RequestHandler {
  return (request, _response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
    // The internal service credential is non-cookie authentication and is independently scoped.
    const token = bearerToken(request);
    if (env.LENDING_API_SERVICE_TOKEN && token && safeEqual(token, env.LENDING_API_SERVICE_TOKEN) && isIntegrationDecisionRequest(request)) return next();
    const origin = request.header('origin');
    const configured = env.APP_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean);
    const allowed = configured?.length ? configured : env.APP_ENV === 'production' ? [] : ['http://localhost:5173', 'http://localhost:5174'];
    if (!origin || !allowed.includes(origin)) return next(new HttpProblem(403, 'forbidden', 'The request origin is not allowed.'));
    const site = request.header('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return next(new HttpProblem(403, 'forbidden', 'Cross-site mutations are not allowed.'));
    next();
  };
}

export function sessionCookie(token: string, production: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${production ? '; Secure' : ''}`;
}

export function clearedSessionCookie(production: boolean): string {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${production ? '; Secure' : ''}`;
}

export function makeSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function sessionExpiry(): Date { return new Date(Date.now() + SESSION_TTL_MS); }
export { verify };
