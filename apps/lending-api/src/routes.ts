import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { Router, type RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import { currentUserSchema, loginRequestSchema } from '@vnext/contracts';
import type { Database } from '@vnext/db/types';
import { HttpProblem, requireSession } from '@vnext/server-platform';
import type { FlagProvider } from '@vnext/server-platform/flags';
import { clearedSessionCookie, hashSessionToken, makeSessionToken, resolveActor, sessionCookie, sessionExpiry, SESSION_COOKIE } from './auth.js';
import { scenarioRoutes } from './scenarios.js';
import { metadataRoutes } from './metadata.js';

function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const index = pair.indexOf('=');
    if (index >= 0 && pair.slice(0, index).trim() === SESSION_COOKIE) {
      try { return decodeURIComponent(pair.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

async function currentUser(db: Kysely<Database>, userId: string, requestedBusinessUnitId?: string) {
  const user = await db.selectFrom('iam.AppUser').select(['id', 'displayName']).where('id', '=', userId).executeTakeFirst();
  if (!user) throw new HttpProblem(401, 'unauthorized', 'The session is no longer valid.');
  const roles = await db.selectFrom('iam.UserRole as ur').innerJoin('iam.Role as r', 'r.id', 'ur.roleId').select('r.code').where('ur.userId', '=', userId).orderBy('r.code').execute();
  const permissionRows = await db.selectFrom('iam.UserRole as ur').innerJoin('iam.RolePermission as rp', 'rp.roleId', 'ur.roleId').innerJoin('iam.Permission as p', 'p.id', 'rp.permissionId').select('p.key').where('ur.userId', '=', userId).execute();
  const unit = await db.selectFrom('core.BusinessUnit').select('id').where('isActive', '=', true).orderBy('code').executeTakeFirst();
  return currentUserSchema.parse({
    actor: { id: user.id, type: 'user', displayName: user.displayName },
    roles: roles.map((role) => role.code),
    permissions: [...new Set(permissionRows.map((row) => row.key))].sort(),
    activeBusinessUnitId: requestedBusinessUnitId ?? unit?.id ?? null,
  });
}

export function apiRoutes(db: Kysely<Database>, env: NodeJS.ProcessEnv, flags?: FlagProvider): RequestHandler {
  const router = Router();
  const auth = Router();
  auth.post('/login', async (request, response) => {
    const input = loginRequestSchema.parse(request.body);
    const user = await db.selectFrom('iam.AppUser').selectAll().where('email', '=', input.email.trim().toLowerCase()).executeTakeFirst();
    let validPassword = false;
    if (user?.isActive) {
      try { validPassword = await verify(user.passwordHash, input.password); } catch { validPassword = false; }
    }
    if (!user?.isActive || !validPassword) throw new HttpProblem(401, 'unauthorized', 'Email or password is incorrect.');
    const token = makeSessionToken();
    await db.insertInto('iam.UserSession').values({
      id: randomUUID(), userId: user.id, tokenHash: hashSessionToken(token), expiresAt: sessionExpiry(), revokedAt: null,
    }).execute();
    response.setHeader('Set-Cookie', sessionCookie(token, env.APP_ENV === 'production'));
    response.json(await currentUser(db, user.id));
  });

  auth.post('/logout', async (request, response) => {
    const token = readSessionToken(request.header('cookie'));
    if (token) {
      await db.updateTable('iam.UserSession').set({ revokedAt: new Date() }).where('tokenHash', '=', hashSessionToken(token)).where('revokedAt', 'is', null).execute();
    }
    response.setHeader('Set-Cookie', clearedSessionCookie(env.APP_ENV === 'production'));
    response.status(204).end();
  });

  auth.get('/me', requireSession(), async (request, response) => {
    const actor = request.context?.actor;
    if (!actor || actor.type !== 'user') throw new HttpProblem(401, 'unauthorized', 'A user session is required.');
    response.json(await currentUser(db, actor.id, request.context?.businessUnitId));
  });

  router.use('/auth', auth);
  router.use('/scenarios', scenarioRoutes(db, { ...(flags ? { flags } : {}) }));
  router.use('/admin/metadata', metadataRoutes(db, env));
  return router;
}

export function actorResolver(db: Kysely<Database>, env: NodeJS.ProcessEnv) {
  return (request: Parameters<typeof resolveActor>[1]) => resolveActor(db, request, env);
}

export async function provisionLocalUser(db: Kysely<Database>, email: string, password: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail)) throw new Error('LOCAL_USER_EMAIL must be a valid email address.');
  if (password.length < 12 || password.length > 256) throw new Error('LOCAL_USER_PASSWORD must be 12 to 256 characters.');
  const id = randomUUID();
  const passwordHash = await hash(password);
  await db.transaction().execute(async (trx) => {
    const existing = await trx.selectFrom('iam.AppUser').select('id').where('email', '=', normalizedEmail).executeTakeFirst();
    if (existing) await trx.updateTable('iam.AppUser').set({ passwordHash, isActive: true, updatedAt: new Date() }).where('id', '=', existing.id).execute();
    else await trx.insertInto('iam.AppUser').values({ id, email: normalizedEmail, passwordHash, displayName: 'Local Developer', isActive: true, updatedAt: new Date() }).execute();
    const userId = existing?.id ?? id;
    const role = await trx.selectFrom('iam.Role').select('id').where('code', '=', 'local-developer').executeTakeFirst();
    const roleId = role?.id ?? randomUUID();
    if (!role) await trx.insertInto('iam.Role').values({ id: roleId, code: 'local-developer', name: 'Local developer' }).execute();
    const requestedPermissions = [
      ['scenarios.read', 'Read scenarios'], ['scenarios.write', 'Edit scenarios'], ['audit.read', 'Read audit events'],
      ['metadata.read', 'Read metadata revisions'], ['metadata.edit', 'Edit metadata drafts'], ['metadata.publish', 'Publish metadata revisions'],
    ] as const;
    for (const [key, description] of requestedPermissions) {
      const permission = await trx.selectFrom('iam.Permission').select('id').where('key', '=', key).executeTakeFirst();
      const permissionId = permission?.id ?? randomUUID();
      if (!permission) await trx.insertInto('iam.Permission').values({ id: permissionId, key, description }).execute();
      const assignment = await trx.selectFrom('iam.RolePermission').select('roleId').where('roleId', '=', roleId).where('permissionId', '=', permissionId).executeTakeFirst();
      if (!assignment) await trx.insertInto('iam.RolePermission').values({ roleId, permissionId }).execute();
    }
    const userRole = await trx.selectFrom('iam.UserRole').select('userId').where('userId', '=', userId).where('roleId', '=', roleId).executeTakeFirst();
    if (!userRole) await trx.insertInto('iam.UserRole').values({ userId, roleId }).execute();
  });
}

export function localUserProvisioningAllowed(env: NodeJS.ProcessEnv): boolean {
  return env.APP_ENV === 'local' && env.NODE_ENV !== 'production';
}

