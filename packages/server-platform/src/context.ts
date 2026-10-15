import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export type ActorType = 'user' | 'service' | 'system';

/** Identity and permissions must come from the server-side session resolver. */
export interface Actor {
  readonly id: string;
  readonly type: ActorType;
  readonly permissions: ReadonlySet<string>;
}

export interface RequestContext {
  readonly requestId: string;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly app: string;
  readonly environment: string;
  readonly version: string;
  readonly actor?: Actor;
  readonly businessUnitId?: string;
}

declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

export interface ContextOptions {
  readonly app: string;
  readonly environment: string;
  readonly version: string;
  readonly resolveActor?: (request: Request) => Promise<Actor | undefined>;
  /** Resolve only from a validated, server-approved business-unit selection. */
  readonly resolveBusinessUnit?: (request: Request) => Promise<string | undefined>;
  readonly makeRequestId?: () => string;
}

function trustedCorrelationId(value: string | undefined): string | undefined {
  if (value && /^[\da-f]{32}$/i.test(value)) return value.toLowerCase();
  return undefined;
}

export function requestContext(options: ContextOptions) {
  return async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await options.resolveActor?.(request);
      const businessUnitId = await options.resolveBusinessUnit?.(request);
      const traceId = trustedCorrelationId(request.header('traceparent')?.split('-')[1]);
      request.context = {
        requestId: options.makeRequestId?.() ?? randomUUID(),
        app: options.app,
        environment: options.environment,
        version: options.version,
        ...(traceId ? { traceId } : {}),
        ...(actor ? { actor } : {}),
        ...(businessUnitId ? { businessUnitId } : {}),
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRequestContext(request: Request): RequestContext {
  if (!request.context) throw new Error('request_context_missing');
  return request.context;
}
