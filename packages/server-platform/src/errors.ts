import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';

export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: z.string(),
  requestId: z.string(),
  detail: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors?: Readonly<Record<string, readonly string[]>>,
  ) {
    super(message);
    this.name = 'HttpProblem';
  }
}

const known: Readonly<Record<string, { status: number; title: string }>> = {
  unauthorized: { status: 401, title: 'Authentication required' },
  forbidden: { status: 403, title: 'Permission denied' },
  not_found: { status: 404, title: 'Resource not found' },
  conflict: { status: 409, title: 'Conflict' },
  reload_required: { status: 409, title: 'Reload required' },
  dependency_timeout: { status: 503, title: 'Dependency unavailable' },
  validation_failed: { status: 400, title: 'Invalid request' },
};

export const problemHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const requestId = request.context?.requestId ?? 'unavailable';
  let status = 500;
  let code = 'internal_error';
  let title = 'Internal server error';
  let detail: string | undefined;
  let errors: Readonly<Record<string, readonly string[]>> | undefined;

  if (error instanceof HttpProblem) {
    status = error.status;
    code = error.code;
    title = known[code]?.title ?? 'Request failed';
    detail = error.message;
    errors = error.errors;
  } else if (error instanceof z.ZodError) {
    status = 400;
    code = 'validation_failed';
    title = known[code]!.title;
    errors = Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || 'request', [issue.message]]));
  }

  const body: ProblemDetails = {
    type: `https://vnext.invalid/problems/${code}`,
    title,
    status,
    code,
    requestId,
    ...(detail && status < 500 ? { detail } : {}),
    ...(errors ? { errors } : {}),
  };
  response.status(status).type('application/problem+json').json(body);
};
