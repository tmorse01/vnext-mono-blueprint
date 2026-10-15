import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vnext/db/types';
import type { RequestContext } from '@vnext/server-platform/context';

export interface AuditChange { field: string; before?: string | number | boolean | null; after?: string | number | boolean | null; }

/** Business writes, audit events, and archive outbox rows commit or roll back together. */
export async function appendAudit(
  trx: Transaction<Database>,
  context: RequestContext,
  event: { action: string; entityType: string; entityId: string; changes: AuditChange[]; metadataRevisionId?: string | null; productVersionId?: string | null; pricingVersionId?: string | null },
): Promise<void> {
  const id = randomUUID();
  await trx.insertInto('audit.AuditEvent').values({
    id,
    occurredAt: new Date(),
    actorId: context.actor?.id ?? null,
    actorType: context.actor?.type ?? 'system',
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    businessUnitId: context.businessUnitId ?? null,
    changes: JSON.stringify(event.changes),
    metadataRevisionId: event.metadataRevisionId ?? null,
    productVersionId: event.productVersionId ?? null,
    pricingVersionId: event.pricingVersionId ?? null,
    correlationId: context.requestId,
    traceId: context.traceId ?? null,
    application: context.app,
    deploymentVersion: context.version,
  }).execute();
  await trx.insertInto('audit.ArchiveOutbox').values({
    eventId: id,
    state: 'pending',
    attemptCount: 0,
    availableAt: new Date(),
    lastAttemptAt: null,
    deliveredAt: null,
    archiveUri: null,
    checksum: null,
    lastError: null,
  }).execute();
}

export async function withSerializable<T>(db: Kysely<Database>, callback: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  return db.transaction().setIsolationLevel('serializable').execute(callback);
}
