import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Kysely, Transaction } from 'kysely';
import {
  metadataContextQuerySchema,
  metadataDraftCreateRequestSchema,
  metadataDraftResponseSchema,
  metadataDraftUpdateRequestSchema,
  metadataEnvironmentSchema,
  metadataPreviewRequestSchema,
  metadataPreviewResultSchema,
  metadataPublishRequestSchema,
  metadataRevisionListQuerySchema,
  metadataRevisionPageSchema,
  metadataRevisionSchema,
  metadataValidationRequestSchema,
  metadataValidationResultSchema,
  metadataWorkspaceSchema,
  scenarioAuditPageSchema,
} from '@vnext/contracts';
import { evaluateCondition, metadataDocumentSchema, validateMetadataAgainstRegistry, type MetadataDocument } from '@vnext/metadata';
import type { Database, MetadataRevisionTable } from '@vnext/db/types';
import { HttpProblem, requirePermission, requireSession } from '@vnext/server-platform';
import type { RequestContext } from '@vnext/server-platform/context';
import { appendAudit, withSerializable } from './audit.js';

const knownFieldKeys = new Set([
  'name', 'loanAmount', 'rate', 'termMonths', 'construction.projectType',
  'construction.constructionMonths', 'dscr.monthlyRent', 'dscr.monthlyExpenses',
]);

function revisionToken(value: Uint8Array): string { return Buffer.from(value).toString('base64url'); }
function decodeRevisionToken(value: string): Uint8Array {
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 8 || revisionToken(bytes) !== value) throw new HttpProblem(409, 'conflict', 'The metadata revision token is invalid or stale.');
  return bytes;
}
function jsonDocument(value: string): MetadataDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; } catch { throw new HttpProblem(500, 'internal_error', 'Stored metadata is invalid.'); }
  return metadataDocumentSchema.parse(parsed);
}
function environmentValue(env: NodeJS.ProcessEnv): 'local' | 'preview' | 'production' {
  return metadataEnvironmentSchema.parse(env.APP_ENV ?? 'local');
}
function toDto(row: MetadataRevisionTable, env: NodeJS.ProcessEnv) {
  return metadataRevisionSchema.parse({
    id: row.id, productFamily: row.productFamily, businessUnitId: row.businessUnitId,
    revisionNumber: row.revisionNumber, state: row.state, version: revisionToken(row.version),
    document: jsonDocument(row.document as string), createdAt: new Date(row.createdAt).toISOString(),
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    environment: environmentValue(env),
  });
}

function parseScope(familyValue: unknown, businessUnitValue: unknown) {
  const parsed = metadataContextQuerySchema.parse({
    family: familyValue,
    ...(businessUnitValue === undefined || businessUnitValue === '' ? {} : { businessUnitId: businessUnitValue }),
  });
  return { family: parsed.family, businessUnitId: parsed.businessUnitId ?? null };
}

function scopedAuditContext(context: RequestContext, businessUnitId: string | null): RequestContext {
  if (!businessUnitId) return context;
  return { ...context, businessUnitId };
}

async function ensureBusinessUnit(db: Kysely<Database> | Transaction<Database>, businessUnitId: string | null): Promise<void> {
  if (!businessUnitId) return;
  const row = await db.selectFrom('core.BusinessUnit').select('id').where('id', '=', businessUnitId).where('isActive', '=', true).executeTakeFirst();
  if (!row) throw new HttpProblem(400, 'validation_failed', 'The selected business unit is unavailable.');
}

async function currentPointers(db: Kysely<Database> | Transaction<Database>, family: string, businessUnitId: string | null, env: NodeJS.ProcessEnv) {
  const publishedPointer = businessUnitId
    ? await db.selectFrom('config.MetadataPublication').select(['metadataRevisionId', 'scopeKey']).where('productFamily', '=', family).where('businessUnitId', '=', businessUnitId).executeTakeFirst()
    : undefined;
  const platformPointer = !publishedPointer
    ? await db.selectFrom('config.MetadataPublication').select(['metadataRevisionId', 'scopeKey']).where('productFamily', '=', family).where('scopeKey', '=', 'platform').executeTakeFirst()
    : undefined;
  const publishedId = publishedPointer?.metadataRevisionId ?? platformPointer?.metadataRevisionId ?? null;
  const published = publishedId ? await db.selectFrom('config.MetadataRevision').selectAll().where('id', '=', publishedId).executeTakeFirst() : undefined;
  let draftQuery = db.selectFrom('config.MetadataRevision').selectAll().where('productFamily', '=', family).where('state', '=', 'draft');
  draftQuery = businessUnitId ? draftQuery.where('businessUnitId', '=', businessUnitId) : draftQuery.where('businessUnitId', 'is', null);
  const draft = await draftQuery.orderBy('revisionNumber', 'desc').executeTakeFirst();
  return { published: published ? toDto(published, env) : null, draft: draft ? toDto(draft, env) : null };
}

function valuesByPath(values: Readonly<Record<string, string | number | boolean | null>>, path: string): string | number | boolean | null | undefined {
  if (Object.hasOwn(values, path)) return values[path];
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, values) as string | number | boolean | null | undefined;
}

export function validateMetadataValues(document: MetadataDocument, values: Readonly<Record<string, string | number | boolean | null>>): string[] {
  const issues = validateMetadataAgainstRegistry(document, knownFieldKeys);
  for (const field of document.fields) {
    const visible = !field.visibleWhen || evaluateCondition(field.visibleWhen, values);
    if (!visible) continue;
    const value = valuesByPath(values, field.key);
    if (field.required && (value === undefined || value === null || value === '')) issues.push(`${field.key} is required.`);
    if (typeof value === 'string') {
      if (field.minLength !== undefined && value.length < field.minLength) issues.push(`${field.key} is shorter than ${field.minLength} characters.`);
      if (field.maxLength !== undefined && value.length > field.maxLength) issues.push(`${field.key} is longer than ${field.maxLength} characters.`);
    }
    const numericWidget = field.widget === 'currency' || field.widget === 'percent' || field.widget === 'number';
    if (numericWidget && value !== undefined && value !== null && value !== '') {
      const numericText = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '';
      if (!/^-?\d+(\.\d+)?$/u.test(numericText)) {
        issues.push(`${field.key} must be a decimal value.`);
        continue;
      }
      const numeric = Number(numericText);
      if (field.min !== undefined && numeric < field.min) issues.push(`${field.key} must be at least ${field.min}.`);
      if (field.max !== undefined && numeric > field.max) issues.push(`${field.key} must be at most ${field.max}.`);
    }
    if (field.options && value !== null && value !== undefined && !field.options.some((option) => option.value === value)) issues.push(`${field.key} is not an allowed option.`);
  }
  return issues;
}

function cursorValue(value: string): { revisionNumber: number; id: string } {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const split = decoded.indexOf('|');
    const revisionNumber = Number(decoded.slice(0, split));
    const id = decoded.slice(split + 1);
    if (split < 0 || !Number.isInteger(revisionNumber) || !/^[0-9a-f-]{36}$/iu.test(id)) throw new Error('bad cursor');
    return { revisionNumber, id };
  } catch { throw new HttpProblem(400, 'validation_failed', 'The metadata revision cursor is invalid.'); }
}
function cursorFor(row: MetadataRevisionTable): string { return Buffer.from(`${row.revisionNumber}|${row.id}`).toString('base64url'); }
function auditCursorFor(row: { occurredAt: Date; id: string }): string { return Buffer.from(`${new Date(row.occurredAt).toISOString()}|${row.id}`).toString('base64url'); }
function parseAuditCursor(value: unknown): { occurredAt: Date; id: string } | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpProblem(400, 'validation_failed', 'The audit cursor is invalid.');
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const split = decoded.indexOf('|');
    const occurredAt = new Date(decoded.slice(0, split));
    const id = decoded.slice(split + 1);
    if (split < 0 || Number.isNaN(occurredAt.valueOf()) || !/^[0-9a-f-]{36}$/iu.test(id)) throw new Error();
    return { occurredAt, id };
  } catch { throw new HttpProblem(400, 'validation_failed', 'The audit cursor is invalid.'); }
}

export function metadataRoutes(db: Kysely<Database>, env: NodeJS.ProcessEnv): RequestHandler {
  const router = Router();
  router.use(requireSession());

  const requireMetadataRead: RequestHandler = (request, _response, next) => {
    const permissions = request.context?.actor?.permissions;
    if (!permissions) return next(new HttpProblem(401, 'unauthorized', 'A valid session is required.'));
    if (!permissions.has('metadata.read') && !permissions.has('metadata.edit')) return next(new HttpProblem(403, 'forbidden', 'This operation is not permitted.'));
    next();
  };

  router.get('/', requireMetadataRead, async (request, response) => {
    const scope = parseScope(request.query.family, request.query.businessUnitId);
    await ensureBusinessUnit(db, scope.businessUnitId);
    const pointers = await currentPointers(db, scope.family, scope.businessUnitId, env);
    response.json(metadataWorkspaceSchema.parse({ environment: environmentValue(env), ...pointers }));
  });

  router.get('/revisions', requireMetadataRead, async (request, response) => {
    const query = metadataRevisionListQuerySchema.parse(request.query);
    const businessUnitId = query.businessUnitId ?? null;
    await ensureBusinessUnit(db, businessUnitId);
    let builder = db.selectFrom('config.MetadataRevision').selectAll().where('productFamily', '=', query.family);
    builder = businessUnitId ? builder.where('businessUnitId', '=', businessUnitId) : builder.where('businessUnitId', 'is', null);
    if (query.cursor) {
      const cursor = cursorValue(query.cursor);
      builder = builder.where((eb) => eb.or([eb('revisionNumber', '<', cursor.revisionNumber), eb.and([eb('revisionNumber', '=', cursor.revisionNumber), eb('id', '<', cursor.id)])]));
    }
    const rows = await builder.orderBy('revisionNumber', 'desc').orderBy('id', 'desc').limit(query.limit + 1).execute();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    response.json(metadataRevisionPageSchema.parse({ items: page.map((row) => toDto(row, env)), nextCursor: hasMore && last ? cursorFor(last) : null }));
  });

  router.post('/validate', requirePermission('metadata.edit'), async (request, response) => {
    const input = metadataValidationRequestSchema.parse(request.body);
    const businessUnitId = input.businessUnitId ?? null;
    await ensureBusinessUnit(db, businessUnitId);
    const issues = validateMetadataAgainstRegistry(input.document, knownFieldKeys);
    response.json(metadataValidationResultSchema.parse({ valid: issues.length === 0, issues }));
  });

  router.post('/drafts', requirePermission('metadata.edit'), async (request, response) => {
    const input = metadataDraftCreateRequestSchema.parse(request.body);
    const businessUnitId = input.businessUnitId ?? null;
    const context = request.context;
    if (!context?.actor) throw new HttpProblem(401, 'unauthorized', 'A valid session is required.');
    await ensureBusinessUnit(db, businessUnitId);
    let document = input.document ? metadataDocumentSchema.parse(input.document) : undefined;
    const draft = await withSerializable(db, async (trx) => {
      let source: MetadataRevisionTable | undefined;
      if (input.sourceRevisionId) {
        source = await trx.selectFrom('config.MetadataRevision').selectAll().where('id', '=', input.sourceRevisionId).executeTakeFirst();
        if (!source || source.productFamily !== input.productFamily || source.businessUnitId !== businessUnitId) throw new HttpProblem(404, 'not_found', 'The source revision was not found in this metadata scope.');
        if (!document) document = jsonDocument(source.document as string);
      }
      const revisionRows = businessUnitId
        ? await trx.selectFrom('config.MetadataRevision').select('revisionNumber').where('productFamily', '=', input.productFamily).where('businessUnitId', '=', businessUnitId).execute()
        : await trx.selectFrom('config.MetadataRevision').select('revisionNumber').where('productFamily', '=', input.productFamily).where('businessUnitId', 'is', null).execute();
      const id = randomUUID();
      await trx.insertInto('config.MetadataRevision').values({
        id, productFamily: input.productFamily, businessUnitId, revisionNumber: Math.max(0, ...revisionRows.map((row) => row.revisionNumber)) + 1,
        state: 'draft', document: JSON.stringify(document!),
        createdByUserId: context.actor?.type === 'user' ? context.actor.id : null, publishedAt: null,
      }).execute();
      await appendAudit(trx, scopedAuditContext(context, businessUnitId), {
        action: 'metadata.draft_created', entityType: 'MetadataRevision', entityId: id,
        changes: [{ field: 'state', before: null, after: 'draft' }, ...(source ? [{ field: 'sourceRevisionId', after: source.id }] : [])], metadataRevisionId: id,
      });
      return await trx.selectFrom('config.MetadataRevision').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    });
    response.status(201).json(metadataDraftResponseSchema.parse(toDto(draft, env)));
  });

  router.put('/drafts/:revisionId', requirePermission('metadata.edit'), async (request, response) => {
    const input = metadataDraftUpdateRequestSchema.parse(request.body);
    const revisionId = revisionIdValue(request.params.revisionId);
    const context = request.context;
    if (!context?.actor) throw new HttpProblem(401, 'unauthorized', 'A valid session is required.');
    const updated = await withSerializable(db, async (trx) => {
      const draft = await trx.selectFrom('config.MetadataRevision').selectAll().where('id', '=', revisionId).executeTakeFirst();
      if (!draft || draft.state !== 'draft') throw new HttpProblem(404, 'not_found', 'The draft metadata revision was not found.');
      const registryIssues = validateMetadataAgainstRegistry(jsonDocument(draft.document as string), knownFieldKeys);
      if (registryIssues.length) throw new HttpProblem(400, 'validation_failed', 'The metadata draft contains unsupported field keys.', { metadata: registryIssues });
      const result = await trx.updateTable('config.MetadataRevision').set({ document: JSON.stringify(metadataDocumentSchema.parse(input.document)) })
        .where('id', '=', revisionId).where('state', '=', 'draft').where('version', '=', decodeRevisionToken(input.expectedVersion) as never).executeTakeFirst();
      if (Number(result.numUpdatedRows ?? 0) !== 1) throw new HttpProblem(409, 'conflict', 'The metadata draft changed. Reload before saving.');
      await appendAudit(trx, scopedAuditContext(context, draft.businessUnitId), {
        action: 'metadata.draft_updated', entityType: 'MetadataRevision', entityId: draft.id,
        changes: [{ field: 'fieldCount', before: jsonDocument(draft.document as string).fields.length, after: input.document.fields.length }], metadataRevisionId: draft.id,
      });
      return await trx.selectFrom('config.MetadataRevision').selectAll().where('id', '=', revisionId).executeTakeFirstOrThrow();
    });
    response.json(metadataDraftResponseSchema.parse(toDto(updated, env)));
  });

  router.post('/drafts/:revisionId/preview', requirePermission('metadata.edit'), async (request, response) => {
    const input = metadataPreviewRequestSchema.parse(request.body);
    const revisionId = revisionIdValue(request.params.revisionId);
    const draft = await db.selectFrom('config.MetadataRevision').selectAll().where('id', '=', revisionId).where('state', '=', 'draft').executeTakeFirst();
    if (!draft) throw new HttpProblem(404, 'not_found', 'The draft metadata revision was not found.');
    const document = jsonDocument(draft.document as string);
    const issues = validateMetadataValues(document, input.values);
    response.json(metadataPreviewResultSchema.parse({ revisionId, document, values: input.values, valid: issues.length === 0, issues }));
  });

  router.post('/drafts/:revisionId/publish', requirePermission('metadata.publish'), async (request, response) => {
    const input = metadataPublishRequestSchema.parse(request.body);
    const revisionId = revisionIdValue(request.params.revisionId);
    const context = request.context;
    if (!context?.actor) throw new HttpProblem(401, 'unauthorized', 'A valid session is required.');
    const published = await withSerializable(db, async (trx) => {
      const draft = await trx.selectFrom('config.MetadataRevision').selectAll().where('id', '=', revisionId).executeTakeFirst();
      if (!draft || draft.state !== 'draft') throw new HttpProblem(404, 'not_found', 'The draft metadata revision was not found.');
      const scopeKey = draft.businessUnitId ? `business-unit:${draft.businessUnitId}` : 'platform';
      const pointer = await trx.selectFrom('config.MetadataPublication').select('metadataRevisionId').where('productFamily', '=', draft.productFamily).where('scopeKey', '=', scopeKey).executeTakeFirst();
      if ((pointer?.metadataRevisionId ?? null) !== input.expectedPublishedRevisionId) throw new HttpProblem(409, 'conflict', 'The published metadata pointer changed. Refresh revision history and try again.');
      const updated = await trx.updateTable('config.MetadataRevision').set({ state: 'published', publishedAt: new Date() })
        .where('id', '=', revisionId).where('state', '=', 'draft').where('version', '=', decodeRevisionToken(input.expectedVersion) as never).executeTakeFirst();
      if (Number(updated.numUpdatedRows ?? 0) !== 1) throw new HttpProblem(409, 'conflict', 'The metadata draft changed. Reload before publishing.');
      if (pointer) await trx.updateTable('config.MetadataPublication').set({ metadataRevisionId: revisionId, publishedAt: new Date() }).where('productFamily', '=', draft.productFamily).where('scopeKey', '=', scopeKey).execute();
      else await trx.insertInto('config.MetadataPublication').values({ productFamily: draft.productFamily, scopeKey, businessUnitId: draft.businessUnitId, metadataRevisionId: revisionId, publishedAt: new Date() }).execute();
      if (pointer) await trx.updateTable('config.MetadataRevision').set({ state: 'superseded' }).where('id', '=', pointer.metadataRevisionId).where('state', '=', 'published').execute();
      await appendAudit(trx, scopedAuditContext(context, draft.businessUnitId), {
        action: 'metadata.published', entityType: 'MetadataRevision', entityId: draft.id,
        changes: [{ field: 'publishedRevisionId', before: pointer?.metadataRevisionId ?? null, after: draft.id }], metadataRevisionId: draft.id,
      });
      return await trx.selectFrom('config.MetadataRevision').selectAll().where('id', '=', revisionId).executeTakeFirstOrThrow();
    });
    response.json(metadataDraftResponseSchema.parse(toDto(published, env)));
  });

  router.get('/:revisionId/audit', requirePermission('audit.read'), async (request, response) => {
    const revisionId = revisionIdValue(request.params.revisionId);
    const limit = Number(request.query.limit ?? 25);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpProblem(400, 'validation_failed', 'limit must be from 1 through 100.');
    const cursor = parseAuditCursor(request.query.cursor);
    const revision = await db.selectFrom('config.MetadataRevision').select('id').where('id', '=', revisionId).executeTakeFirst();
    if (!revision) throw new HttpProblem(404, 'not_found', 'The metadata revision was not found.');
    let auditQuery = db.selectFrom('audit.AuditEvent as ae').leftJoin('iam.AppUser as u', 'u.id', 'ae.actorId')
      .select(['ae.id', 'ae.occurredAt', 'ae.actorId', 'u.displayName as actorDisplayName', 'ae.actorType', 'ae.action', 'ae.entityType', 'ae.entityId', 'ae.changes', 'ae.metadataRevisionId', 'ae.productVersionId', 'ae.pricingVersionId', 'ae.correlationId'])
      .where('ae.entityType', '=', 'MetadataRevision').where('ae.entityId', '=', revisionId);
    if (cursor) auditQuery = auditQuery.where((eb) => eb.or([
      eb('ae.occurredAt', '<', cursor.occurredAt),
      eb.and([eb('ae.occurredAt', '=', cursor.occurredAt), eb('ae.id', '<', cursor.id)]),
    ]));
    const rows = await auditQuery.orderBy('ae.occurredAt', 'desc').orderBy('ae.id', 'desc').limit(limit + 1).execute();
    const items = rows.slice(0, limit).map((row) => ({
      id: row.id, occurredAt: new Date(row.occurredAt).toISOString(), actorId: row.actorId ?? 'system',
      ...(row.actorDisplayName ? { actorDisplayName: row.actorDisplayName } : {}), actorType: row.actorType,
      action: row.action, entityType: row.entityType, entityId: row.entityId,
      changes: JSON.parse(row.changes as string) as unknown, metadataRevisionId: row.metadataRevisionId,
      productVersionId: row.productVersionId, pricingVersionId: row.pricingVersionId,
      ...(row.correlationId ? { requestId: row.correlationId } : {}),
    }));
    const last = rows[Math.min(limit, rows.length) - 1];
    response.json(scenarioAuditPageSchema.parse({ items, nextCursor: rows.length > limit && last ? auditCursorFor(last) : null }));
  });

  return router;
}

function revisionIdValue(value: string | undefined): string {
  if (!value || value.length > 128) throw new HttpProblem(400, 'validation_failed', 'The metadata revision ID is invalid.');
  return value;
}
