import type { RequestHandler } from 'express';
import type { Actor } from './context.js';
import { HttpProblem } from './errors.js';

/** Adapter boundary for opaque server-side sessions; no cookie/session store is provided here. */
export interface SessionResolver {
  resolve(request: Parameters<RequestHandler>[0]): Promise<Actor | undefined>;
}

export function requireSession(): RequestHandler {
  return (request, _response, next) => {
    if (!request.context?.actor) return next(new HttpProblem(401, 'unauthorized', 'A valid session is required.'));
    next();
  };
}

export function requirePermission(permission: string): RequestHandler {
  return (request, _response, next) => {
    const actor = request.context?.actor;
    if (!actor) return next(new HttpProblem(401, 'unauthorized', 'A valid session is required.'));
    if (!actor.permissions.has(permission)) return next(new HttpProblem(403, 'forbidden', 'This operation is not permitted.'));
    next();
  };
}

export function actorFromSession(resolver: SessionResolver) {
  return (request: Parameters<SessionResolver['resolve']>[0]) => resolver.resolve(request);
}
