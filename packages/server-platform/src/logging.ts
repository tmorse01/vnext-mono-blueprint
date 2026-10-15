import pino, { type Logger as PinoLogger } from 'pino';
import type { RequestHandler } from 'express';
import type { RequestContext } from './context.js';

export interface Logger {
  info(fields: Readonly<Record<string, unknown>>, message: string): void;
  warn(fields: Readonly<Record<string, unknown>>, message: string): void;
  error(fields: Readonly<Record<string, unknown>>, message: string): void;
}

export function createLogger(bindings: { app: string; environment: string; version: string }): Logger {
  const logger: PinoLogger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: bindings.app, environment: bindings.environment, release: bindings.version },
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.secret'], censor: '[REDACTED]' },
    serializers: { err: pino.stdSerializers.err },
  });
  return logger;
}

export function requestLogger(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();
    response.on('finish', () => {
      const context = request.context;
      logger.info({
        requestId: context?.requestId,
        traceId: context?.traceId,
        spanId: context?.spanId,
        actorId: safeActorRef(context),
        method: request.method,
        route: request.route?.path ?? 'unmatched',
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }, 'http.request');
    });
    next();
  };
}

function safeActorRef(context: RequestContext | undefined): string | undefined {
  if (!context?.actor) return undefined;
  return `${context.actor.type}:${context.actor.id}`;
}
