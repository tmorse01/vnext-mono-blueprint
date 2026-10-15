import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Kysely } from 'kysely';
import { integrationDecisionRequestSchema, integrationDecisionResponseSchema } from '@vnext/contracts';
import type { Database } from '@vnext/db/types';
import { HttpProblem } from '@vnext/server-platform';

export const callbackSchema = integrationDecisionRequestSchema;
export type MockDecision = typeof integrationDecisionRequestSchema._output;

export interface DeliveryRecord {
  id: string;
  provider: string;
  idempotencyKey: string;
  payloadHash: string;
  state: 'received' | 'processing' | 'completed' | 'failed';
  responseStatus: number | null;
  responseBody: string | null;
}

export interface DeliveryStore {
  /** Insert the idempotency record; return false when the unique provider/key pair already exists. */
  claim(record: DeliveryRecord): Promise<boolean>;
  find(provider: string, idempotencyKey: string): Promise<DeliveryRecord | undefined>;
  update(provider: string, idempotencyKey: string, changes: Pick<DeliveryRecord, 'state' | 'responseStatus' | 'responseBody'>): Promise<void>;
}

export function createSqlDeliveryStore(db: Kysely<Database>): DeliveryStore {
  const find = async (provider: string, idempotencyKey: string): Promise<DeliveryRecord | undefined> => {
    const row = await db.selectFrom('integrations.IntegrationDelivery').selectAll().where('provider', '=', provider).where('idempotencyKey', '=', idempotencyKey).executeTakeFirst();
    return row ? { ...row, responseBody: row.responseBody as string | null } : undefined;
  };
  return {
    async claim(record) {
      try {
        await db.insertInto('integrations.IntegrationDelivery').values({
          ...record,
          responseBody: record.responseBody,
          updatedAt: new Date(),
        }).execute();
        return true;
      } catch {
        // The unique provider/idempotency-key constraint is the concurrency arbiter.
        const existing = await find(record.provider, record.idempotencyKey);
        if (existing) return false;
        throw new HttpProblem(503, 'dependency_timeout', 'Integration delivery storage is unavailable.');
      }
    },
    find,
    async update(provider, idempotencyKey, changes) {
      await db.updateTable('integrations.IntegrationDelivery').set({ ...changes, updatedAt: new Date() }).where('provider', '=', provider).where('idempotencyKey', '=', idempotencyKey).execute();
    },
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

export function payloadDigest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export interface CallbackOptions {
  store: DeliveryStore;
  callbackSecret: string;
  lendingApiUrl: string;
  serviceToken: string;
  fetcher?: typeof fetch;
}

export function mockProviderCallback(options: CallbackOptions): RequestHandler {
  const fetcher = options.fetcher ?? fetch;
  return async (request, response) => {
    const authorization = request.header('authorization');
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!constantTimeEqual(supplied, options.callbackSecret)) throw new HttpProblem(401, 'unauthorized', 'The mock provider credential is invalid.');
    const idempotencyKey = request.header('idempotency-key');
    if (!idempotencyKey || idempotencyKey.length > 200 || !/^[\x21-\x7e]+$/u.test(idempotencyKey)) {
      throw new HttpProblem(400, 'validation_failed', 'A printable idempotency-key header of at most 200 characters is required.');
    }
    const body = callbackSchema.parse(request.body);
    const payloadHash = payloadDigest(body);
    const claimed = await options.store.claim({
      id: randomUUID(), provider: 'mock-provider', idempotencyKey, payloadHash,
      state: 'processing', responseStatus: null, responseBody: null,
    });
    if (!claimed) {
      const existing = await options.store.find('mock-provider', idempotencyKey);
      if (!existing) throw new HttpProblem(503, 'dependency_timeout', 'The integration delivery could not be loaded.');
      if (existing.payloadHash !== payloadHash) throw new HttpProblem(409, 'conflict', 'The idempotency key was already used with a different payload.');
      if (existing.state === 'completed' && existing.responseBody && existing.responseStatus) {
        response.status(existing.responseStatus).json(integrationDecisionResponseSchema.parse(JSON.parse(existing.responseBody) as unknown));
        return;
      }
      if (existing.state === 'processing' || existing.state === 'received') {
        response.status(202).json(integrationDecisionResponseSchema.parse({ scenarioId: body.scenarioId, status: 'processing', changed: false }));
        return;
      }
      throw new HttpProblem(409, 'conflict', 'This delivery failed and requires operator review before retry.');
    }

    let upstream: Response;
    try {
      upstream = await fetcher(new URL('/api/scenarios/internal/integration-events', options.lendingApiUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.serviceToken}`, 'idempotency-key': idempotencyKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      const failure = { code: 'lending_api_unavailable' };
      await options.store.update('mock-provider', idempotencyKey, { state: 'failed', responseStatus: 503, responseBody: JSON.stringify(failure) });
      throw new HttpProblem(503, 'dependency_timeout', 'The lending API did not return a response. The delivery is saved for operator review.');
    }
    const responseText = await upstream.text();
    let upstreamBody: unknown;
    try { upstreamBody = responseText ? JSON.parse(responseText) as unknown : {}; } catch { upstreamBody = { code: 'upstream_invalid_response' }; }
    if (!upstream.ok) {
      const status = upstream.status === 409 ? 409 : 503;
      const failure = { code: upstream.status === 409 ? 'lending_api_conflict' : 'lending_api_rejected' };
      await options.store.update('mock-provider', idempotencyKey, { state: 'failed', responseStatus: status, responseBody: JSON.stringify(failure) });
      throw new HttpProblem(status, status === 409 ? 'conflict' : 'dependency_timeout', 'The lending API rejected the delivery. The callback is saved for operator review.');
    }
    const parsedResponse = integrationDecisionResponseSchema.safeParse(upstreamBody);
    if (!parsedResponse.success) {
      const failure = { code: 'lending_api_invalid_response' };
      await options.store.update('mock-provider', idempotencyKey, { state: 'failed', responseStatus: 503, responseBody: JSON.stringify(failure) });
      throw new HttpProblem(503, 'dependency_timeout', 'The lending API returned an invalid response. The delivery is saved for operator review.');
    }
    const decisionResponse = parsedResponse.data;
    await options.store.update('mock-provider', idempotencyKey, { state: 'completed', responseStatus: upstream.status, responseBody: JSON.stringify(decisionResponse) });
    response.status(upstream.status).json(decisionResponse);
  };
}

export function callbackRouter(options: CallbackOptions): Router {
  const router = Router();
  router.post('/mock-provider/callback', mockProviderCallback(options));
  return router;
}

