import { randomUUID } from 'node:crypto';
import type { RequestContext } from './context.js';

export interface AuditFieldChange {
  readonly field: string;
  readonly before?: string | number | boolean | null;
  readonly after?: string | number | boolean | null;
}
export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorType: 'user' | 'service' | 'system';
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly businessUnitId?: string;
  readonly changes: readonly AuditFieldChange[];
  readonly traceId?: string;
  readonly app: string;
  readonly version: string;
}
export interface AuditOutboxEntry { readonly eventId: string; readonly state: 'pending'; }

/** The implementation must use one SQL transaction for work, append-only audit, and outbox writes. */
export interface AuditedTransaction<Tx> {
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  appendAudit(tx: Tx, event: AuditEvent): Promise<void>;
  enqueueArchive(tx: Tx, entry: AuditOutboxEntry): Promise<void>;
}
export interface MutationResult<T> {
  readonly value: T;
  readonly changed: boolean;
  readonly changes: readonly AuditFieldChange[];
  readonly entityId: string;
}
export interface AuditMutation<Tx, T> {
  readonly context: RequestContext;
  readonly action: string;
  readonly entityType: string;
  readonly run: (tx: Tx) => Promise<MutationResult<T>>;
  /** Explicitly code-owned allowlist; unlisted values never enter the audit record. */
  readonly allowedFields: ReadonlySet<string>;
  readonly redactedFields?: ReadonlySet<string>;
}

export async function auditedMutation<Tx, T>(
  database: AuditedTransaction<Tx>,
  input: AuditMutation<Tx, T>,
): Promise<T> {
  const actor = input.context.actor;
  if (!actor) throw new Error('audited_mutation_requires_actor');
  return database.transaction(async (tx) => {
    const result = await input.run(tx);
    if (!result.changed) return result.value;
    const changes = input.redactedFields
      ? result.changes.map((change) => input.redactedFields!.has(change.field)
        ? { field: change.field, before: '[REDACTED]', after: '[REDACTED]' }
        : change)
      : result.changes;
    if (changes.some((change) => !input.allowedFields.has(change.field))) {
      throw new Error('audit_field_not_allowlisted');
    }
    const event: AuditEvent = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      actorId: actor.id,
      actorType: actor.type,
      action: input.action,
      entityType: input.entityType,
      entityId: result.entityId,
      changes,
      app: input.context.app,
      version: input.context.version,
      ...(input.context.businessUnitId ? { businessUnitId: input.context.businessUnitId } : {}),
      ...(input.context.traceId ? { traceId: input.context.traceId } : {}),
    };
    await database.appendAudit(tx, event);
    await database.enqueueArchive(tx, { eventId: event.id, state: 'pending' });
    return result.value;
  });
}
