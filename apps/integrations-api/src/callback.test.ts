import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { callbackRouter, type DeliveryRecord, type DeliveryStore } from './callback.js';

class MemoryStore implements DeliveryStore {
  readonly rows = new Map<string, DeliveryRecord>();
  private key(provider: string, idempotencyKey: string): string { return `${provider}:${idempotencyKey}`; }
  async claim(record: DeliveryRecord): Promise<boolean> {
    const key = this.key(record.provider, record.idempotencyKey);
    if (this.rows.has(key)) return false;
    this.rows.set(key, { ...record });
    return true;
  }
  async find(provider: string, idempotencyKey: string): Promise<DeliveryRecord | undefined> {
    const record = this.rows.get(this.key(provider, idempotencyKey));
    return record ? { ...record } : undefined;
  }
  async update(provider: string, idempotencyKey: string, changes: Pick<DeliveryRecord, 'state' | 'responseStatus' | 'responseBody'>): Promise<void> {
    const record = this.rows.get(this.key(provider, idempotencyKey));
    if (!record) throw new Error('missing delivery');
    Object.assign(record, changes);
  }
}

function setup(fetcher: typeof fetch = vi.fn(async () => new Response(JSON.stringify({ scenarioId: body.scenarioId, status: 'approved', changed: true }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch) {
  const store = new MemoryStore();
  const app = express();
  app.use(express.json());
  app.use('/api', callbackRouter({ store, callbackSecret: 'x'.repeat(40), lendingApiUrl: 'http://lending.test', serviceToken: 'y'.repeat(40), fetcher }));
  return { app, store, fetcher };
}

const body = { scenarioId: 'a705c1a5-59cd-4690-8b35-321a68e73a34', providerReference: 'mock-approval-1001', decision: 'approved' } as const;

describe('mock provider callback', () => {
  it('authenticates, calls lending once, and replays a completed idempotent response', async () => {
    const { app, store, fetcher } = setup();
    const first = await request(app).post('/api/mock-provider/callback').set('Authorization', `Bearer ${'x'.repeat(40)}`).set('Idempotency-Key', 'decision-1').send(body);
    const repeated = await request(app).post('/api/mock-provider/callback').set('Authorization', `Bearer ${'x'.repeat(40)}`).set('Idempotency-Key', 'decision-1').send(body);
    expect(first.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(repeated.body).toEqual(first.body);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect([...store.rows.values()][0]?.state).toBe('completed');
  });

  it('rejects a reused idempotency key with a different payload without calling lending again', async () => {
    const { app, fetcher } = setup();
    const first = await request(app).post('/api/mock-provider/callback').set('Authorization', `Bearer ${'x'.repeat(40)}`).set('Idempotency-Key', 'decision-2').send(body);
    const second = await request(app).post('/api/mock-provider/callback').set('Authorization', `Bearer ${'x'.repeat(40)}`).set('Idempotency-Key', 'decision-2').send({ ...body, providerReference: 'different' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not persist or call lending for an unauthenticated callback', async () => {
    const { app, store, fetcher } = setup();
    const result = await request(app).post('/api/mock-provider/callback').set('Authorization', `Bearer ${'z'.repeat(40)}`).set('Idempotency-Key', 'decision-3').send(body);
    expect(result.status).toBe(401);
    expect(store.rows.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns the shared processing response shape for an in-flight duplicate', async () => {
    const { app, store, fetcher } = setup();
    await store.claim({ id: 'delivery-1', provider: 'mock-provider', idempotencyKey: 'decision-4', payloadHash: 'hash', state: 'processing', responseStatus: null, responseBody: null });
    const response = await request(app).post('/api/mock-provider/callback').set('Authorization', `Bearer ${'x'.repeat(40)}`).set('Idempotency-Key', 'decision-4').send(body);
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ scenarioId: body.scenarioId, status: 'processing', changed: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('marks an invalid successful upstream response failed instead of leaving it processing', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 'approved', changed: true }), { status: 200 })) as unknown as typeof fetch;
    const { app, store } = setup(fetcher);
    const response = await request(app).post('/api/mock-provider/callback').set('Authorization', `Bearer ${'x'.repeat(40)}`).set('Idempotency-Key', 'decision-5').send(body);
    expect(response.status).toBe(503);
    expect([...store.rows.values()][0]?.state).toBe('failed');
  });
});
