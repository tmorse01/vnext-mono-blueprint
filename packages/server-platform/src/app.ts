import express, { type Express, type RequestHandler } from 'express';
import { requestContext, type ContextOptions } from './context.js';
import { HttpProblem, problemHandler } from './errors.js';
import { createLogger, requestLogger, type Logger } from './logging.js';

export interface ApplicationOptions extends ContextOptions {
  readonly logger?: Logger;
  readonly routes?: RequestHandler;
  readonly readiness?: () => Promise<boolean>;
}

/** Shared composition for APIs. Call telemetry bootstrap before importing route modules. */
export function createApplication(options: ApplicationOptions): Express {
  const app = express();
  const logger = options.logger ?? createLogger({ app: options.app, environment: options.environment, version: options.version });
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb', type: 'application/json' }));
  app.use(requestContext(options));
  app.use(requestLogger(logger));
  app.get('/health/live', (_request, response) => response.status(200).json({ status: 'ok' }));
  app.get('/health/ready', async (_request, response, next) => {
    try {
      const ready = await (options.readiness?.() ?? Promise.resolve(true));
      response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
    } catch (error) { next(error); }
  });
  if (options.routes) app.use(options.routes);
  app.use((_request, _response, next) => next(new HttpProblem(404, 'not_found', 'The requested resource was not found.')));
  app.use(problemHandler);
  return app;
}
