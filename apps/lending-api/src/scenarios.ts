import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { sql, type Kysely, type Transaction } from 'kysely';
import { auditChangeSchema, integrationDecisionRequestSchema, integrationDecisionResponseSchema, pageSchema, pricingSnapshotSchema, scenarioAuditPageSchema, scenarioDetailSchema, scenarioListQuerySchema, scenarioSummarySchema, scenarioUpdateRequestSchema } from '@vnext/contracts';
import { asDecimalString, type Database } from '@vnext/db';
import { HttpProblem, requirePermission, requireSession } from '@vnext/server-platform';
import type { FlagProvider } from '@vnext/server-platform/flags';
import { appendAudit, withSerializable } from './audit.js';

type ScenarioRow = {
  id: string; name: string; productFamily: 'construction' | 'dscr'; status: 'draft' | 'submitted' | 'approved' | 'declined';
  loanAmount: string; updatedAt: Date; version: Uint8Array; loanId?: string; productVersionId?: string;
  metadataRevisionId?: string | null; constructionMonths?: number; units?: number; asIsValue?: string | null;
  afterRepairValue?: string | null; totalProjectCost?: string | null; monthlyRent?: string | null;
  monthlyTaxes?: string | null; monthlyInsurance?: string | null; monthlyHoa?: string | null;
  monthlyExpenses?: string | null; purchasePrice?: string | null; propertyValue?: string | null; dscr?: string | null;
  interestRate?: string | null; termMonths?: number | null; projectType?: 'ground_up' | 'renovation';
};

function versionToken(value: Uint8Array): string { return Buffer.from(value).toString('base64url'); }
function decodeVersion(value: string): Uint8Array {
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 8 || versionToken(bytes) !== value) throw new HttpProblem(409, 'conflict', 'The scenario version is invalid or stale.');
  return bytes;
}
function iso(value: Date): string { return new Date(value).toISOString(); }
function readJson(value: string | null | undefined): unknown { if (!value) return null; try { return JSON.parse(value) as unknown; } catch { throw new HttpProblem(500, 'internal_error', 'Stored JSON data is invalid.'); } }
export function decimalForColumn(value: string, precision: number, scale: number, field: string) {
  const [whole = '', fraction = ''] = value.split('.');
  const significantWhole = whole.replace(/^-?0*/u, '') || '0';
  if (significantWhole.length > precision - scale || fraction.length > scale) {
    throw new HttpProblem(400, 'validation_failed', `${field} exceeds the supported decimal precision.`);
  }
  return asDecimalString(value);
}
function encodeCursor(value: { occurredAt: Date; id: string }): string { return Buffer.from(`${value.occurredAt.toISOString()}|${value.id}`).toString('base64url'); }
function decodeAuditCursor(value: string | undefined): { occurredAt: Date; id: string } | undefined {
  if (!value) return undefined;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    const date = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (separator < 0 || Number.isNaN(date.valueOf()) || !/^[0-9a-f-]{36}$/iu.test(id)) throw new Error('invalid');
    return { occurredAt: date, id };
  } catch { throw new HttpProblem(400, 'validation_failed', 'The audit cursor is invalid.'); }
}

function scenarioSelect(db: Kysely<Database> | Transaction<Database>) {
  return db.selectFrom('lending.LoanScenario as s')
    .innerJoin('lending.Loan as l', 'l.id', 's.loanId')
    .innerJoin('lending.ProductVersion as pv', 'pv.id', 's.productVersionId')
    .innerJoin('lending.LoanProduct as lp', 'lp.id', 'pv.productId')
    .innerJoin('lending.LoanProgram as p', 'p.id', 'lp.programId')
    .leftJoin('lending.ConstructionScenarioDetail as cd', 'cd.scenarioId', 's.id')
    .leftJoin('lending.DscrScenarioDetail as dd', 'dd.scenarioId', 's.id')
    .select([
      's.id as id', 's.name as name', 's.status as status', 's.version as version', 's.updatedAt as updatedAt',
      's.loanId as loanId', 's.productVersionId as productVersionId', 's.metadataRevisionId as metadataRevisionId',
      'p.productFamily as productFamily', 's.termMonths as termMonths',
      'cd.constructionMonths as constructionMonths', 'cd.units as constructionUnits', 'cd.projectType as projectType',
      'dd.units as dscrUnits', 'dd.monthlyExpenses as monthlyExpenses',
    ])
    .select(sql<string | null>`CONVERT(varchar(40), s.interestRate)`.as('interestRate'))
    .select(sql<string>`CONVERT(varchar(40), COALESCE(cd.requestedLoanAmount, dd.requestedLoanAmount))`.as('loanAmount'))
    .select(sql<string | null>`CONVERT(varchar(40), cd.asIsValue)`.as('asIsValue'))
    .select(sql<string | null>`CONVERT(varchar(40), cd.afterRepairValue)`.as('afterRepairValue'))
    .select(sql<string | null>`CONVERT(varchar(40), cd.totalProjectCost)`.as('totalProjectCost'))
    .select(sql<string | null>`CONVERT(varchar(40), dd.monthlyRent)`.as('monthlyRent'))
    .select(sql<string | null>`CONVERT(varchar(40), dd.monthlyTaxes)`.as('monthlyTaxes'))
    .select(sql<string | null>`CONVERT(varchar(40), dd.monthlyInsurance)`.as('monthlyInsurance'))
    .select(sql<string | null>`CONVERT(varchar(40), dd.monthlyHoa)`.as('monthlyHoa'))
    .select(sql<string | null>`CONVERT(varchar(40), dd.purchasePrice)`.as('purchasePrice'))
    .select(sql<string | null>`CONVERT(varchar(40), dd.propertyValue)`.as('propertyValue'))
    .select(sql<string | null>`CONVERT(varchar(40), dd.dscr)`.as('dscr'))
}

function summary(row: ScenarioRow): Record<string, unknown> {
  return scenarioSummarySchema.parse({ id: row.id, name: row.name, productFamily: row.productFamily, status: row.status, loanAmount: row.loanAmount, rate: row.interestRate ?? null, termMonths: row.termMonths ?? null, updatedAt: iso(row.updatedAt), version: versionToken(row.version) });
}

async function activeMetadata(db: Kysely<Database> | Transaction<Database>, family: string, businessUnitId: string) {
  const publication = await db.selectFrom('config.MetadataPublication as mp')
    .innerJoin('config.MetadataRevision as mr', 'mr.id', 'mp.metadataRevisionId')
    .select(['mr.id', 'mr.productFamily', 'mr.revisionNumber', 'mr.document'])
    .where('mp.productFamily', '=', family)
    .where('mp.businessUnitId', '=', businessUnitId)
    .executeTakeFirst() ?? await db.selectFrom('config.MetadataPublication as mp')
      .innerJoin('config.MetadataRevision as mr', 'mr.id', 'mp.metadataRevisionId')
      .select(['mr.id', 'mr.productFamily', 'mr.revisionNumber', 'mr.document'])
      .where('mp.productFamily', '=', family)
      .where('mp.scopeKey', '=', 'platform')
      .executeTakeFirst();
  if (!publication) return null;
  return { id: publication.id, productFamily: publication.productFamily, revisionNumber: publication.revisionNumber, document: readJson(publication.document as string) };
}

async function detail(db: Kysely<Database>, id: string): Promise<{ row: ScenarioRow; metadata: Awaited<ReturnType<typeof activeMetadata>> }> {
  const row = await scenarioSelect(db).where('s.id', '=', id).executeTakeFirst() as (ScenarioRow & { constructionUnits?: number; dscrUnits?: number }) | undefined;
  if (!row) throw new HttpProblem(404, 'not_found', 'The scenario was not found.');
  const bu = await db.selectFrom('lending.Loan as l').select('l.businessUnitId').where('l.id', '=', row.loanId!).executeTakeFirstOrThrow();
  const metadata = await activeMetadata(db, row.productFamily, bu.businessUnitId);
  row.units = row.productFamily === 'construction' ? row.constructionUnits : row.dscrUnits;
  return { row, metadata };
}

function makeSummaryRow(row: ScenarioRow & { constructionUnits?: number; dscrUnits?: number }): ScenarioRow {
  return { ...row, units: row.productFamily === 'construction' ? row.constructionUnits : row.dscrUnits };
}

export function scenarioRoutes(db: Kysely<Database>, options: { flags?: FlagProvider } = {}): RequestHandler {
  const router = Router();
  router.use(requireSession());

  router.get('/', requirePermission('scenarios.read'), async (request, response) => {
    const query = scenarioListQuerySchema.parse(request.query);
    const sort = query.sort ?? 'updatedAt';
    if (!['updatedAt', 'name', 'loanAmount'].includes(sort)) throw new HttpProblem(400, 'validation_failed', 'The requested sort is not supported.');
    let builder = scenarioSelect(db);
    if (query.q) builder = builder.where('s.name', 'like', `%${query.q.replaceAll('%', '[%]').replaceAll('_', '[_]')}%`);
    if (query.family) builder = builder.where('p.productFamily', '=', query.family);
    if (query.status) builder = builder.where('s.status', '=', query.status);
    if (query.cursor) {
      const filters = { q: query.q ?? null, family: query.family ?? null, status: query.status ?? null };
      const cursor = decodeListCursor(query.cursor, sort, query.direction, filters);
      const operator = query.direction === 'desc' ? '<' : '>';
      const idOperator = query.direction === 'desc' ? '<' : '>';
      const sortExpression = sort === 'updatedAt' ? sql<Date>`s.updatedAt` : sort === 'name' ? sql<string>`s.name` : sql<string>`COALESCE(cd.requestedLoanAmount, dd.requestedLoanAmount)`;
      builder = builder.where((eb) => eb.or([
        eb(sortExpression as never, operator, cursor.value as never),
        eb.and([eb(sortExpression as never, '=', cursor.value as never), eb('s.id', idOperator, cursor.id)]),
      ]));
    }
    const direction = query.direction;
    const sortExpression = sort === 'updatedAt' ? 's.updatedAt' : sort === 'name' ? 's.name' : sql`COALESCE(cd.requestedLoanAmount, dd.requestedLoanAmount)`;
    const rows = await builder.orderBy(sortExpression as never, direction).orderBy('s.id', direction).limit(query.limit + 1).execute() as (ScenarioRow & { constructionUnits?: number; dscrUnits?: number })[];
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    response.json(pageSchema(scenarioSummarySchema).parse({ items: page.map((row) => summary(makeSummaryRow(row))), nextCursor: hasMore && last ? encodeListCursor(last, sort, direction, { q: query.q ?? null, family: query.family ?? null, status: query.status ?? null }) : null }));
  });

  router.get('/:scenarioId/audit', requirePermission('audit.read'), async (request, response) => {
    const id = zUuid(request.params.scenarioId);
    const limit = Number(request.query.limit ?? 25);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpProblem(400, 'validation_failed', 'limit must be from 1 through 100.');
    const cursor = decodeAuditCursor(typeof request.query.cursor === 'string' ? request.query.cursor : undefined);
    let query = db.selectFrom('audit.AuditEvent as ae').leftJoin('iam.AppUser as u', 'u.id', 'ae.actorId')
      .select(['ae.id', 'ae.occurredAt', 'ae.actorId', 'u.displayName as actorDisplayName', 'ae.actorType', 'ae.action', 'ae.entityType', 'ae.entityId', 'ae.changes', 'ae.metadataRevisionId', 'ae.productVersionId', 'ae.pricingVersionId', 'ae.correlationId'])
      .where('ae.entityType', '=', 'LoanScenario').where('ae.entityId', '=', id);
    if (cursor) query = query.where((eb) => eb.or([eb('ae.occurredAt', '<', cursor.occurredAt), eb.and([eb('ae.occurredAt', '=', cursor.occurredAt), eb('ae.id', '<', cursor.id)])]));
    const rows = await query.orderBy('ae.occurredAt', 'desc').orderBy('ae.id', 'desc').limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => ({
      id: row.id, occurredAt: iso(row.occurredAt), actorId: row.actorId ?? 'system',
      ...(row.actorDisplayName ? { actorDisplayName: row.actorDisplayName } : {}), actorType: row.actorType,
      action: row.action, entityType: row.entityType, entityId: row.entityId,
      changes: auditChangeSchema.array().parse(readJson(row.changes as string)), metadataRevisionId: row.metadataRevisionId,
      productVersionId: row.productVersionId, pricingVersionId: row.pricingVersionId,
      requestId: row.correlationId,
    }));
    const last = rows[Math.min(limit, rows.length) - 1];
    response.json(scenarioAuditPageSchema.parse({ items, nextCursor: hasMore && last ? encodeCursor({ occurredAt: last.occurredAt, id: last.id }) : null }));
  });

  router.get('/:scenarioId', requirePermission('scenarios.read'), async (request, response) => {
    const id = zUuid(request.params.scenarioId);
    const { row, metadata } = await detail(db, id);
    const edit: Record<string, unknown> = {
      expectedVersion: versionToken(row.version),
      metadataRevision: metadata?.id ?? row.metadataRevisionId ?? 'unpublished',
      name: row.name,
      loanAmount: row.loanAmount,
      rate: row.interestRate ?? null,
      termMonths: row.termMonths,
      productFamily: row.productFamily,
      ...(row.productFamily === 'construction' ? { construction: { projectType: row.projectType ?? 'ground_up', constructionMonths: row.constructionMonths ?? 1 } } : {}),
      ...(row.productFamily === 'dscr' ? { dscr: { monthlyRent: row.monthlyRent ?? '0.0000', monthlyExpenses: row.monthlyExpenses ?? '0.0000' } } : {}),
    };
    response.json(scenarioDetailSchema.parse({ scenario: summary(row), edit, metadataRevision: metadata, productVersionId: row.productVersionId }));
  });

  router.put('/:scenarioId', requirePermission('scenarios.write'), async (request, response) => {
    const id = zUuid(request.params.scenarioId);
    const input = scenarioUpdateRequestSchema.parse(request.body);
    const context = request.context;
    if (!context?.actor) throw new HttpProblem(401, 'unauthorized', 'A valid session is required.');
    const updated = await withSerializable(db, async (trx) => {
      const existing = await scenarioSelect(trx).where('s.id', '=', id).executeTakeFirst() as (ScenarioRow & { constructionUnits?: number; dscrUnits?: number }) | undefined;
      if (!existing) throw new HttpProblem(404, 'not_found', 'The scenario was not found.');
      const loan = await trx.selectFrom('lending.Loan').select('businessUnitId').where('id', '=', existing.loanId!).executeTakeFirstOrThrow();
      const metadata = await activeMetadata(trx, existing.productFamily, loan.businessUnitId);
      if (input.metadataRevision !== (metadata?.id ?? 'unpublished')) throw new HttpProblem(409, 'reload_required', 'Published scenario configuration changed. Reload before saving.');
      if (existing.productFamily !== input.productFamily) throw new HttpProblem(400, 'validation_failed', 'A scenario product family cannot be changed.');
      const expectedVersion = decodeVersion(input.expectedVersion);
      const update = await trx.updateTable('lending.LoanScenario').set({
        name: input.name,
        metadataRevisionId: metadata?.id ?? null,
        interestRate: input.rate === null ? null : decimalForColumn(input.rate, 9, 6, 'rate'),
        termMonths: input.termMonths,
        updatedAt: new Date(),
      }).where('id', '=', id).where('version', '=', expectedVersion as never).executeTakeFirst();
      if (Number(update.numUpdatedRows ?? 0) !== 1) throw new HttpProblem(409, 'conflict', 'The scenario was changed by another user. Reload and reapply your edits.');

      if (input.productFamily === 'construction' && input.construction) {
        await trx.updateTable('lending.ConstructionScenarioDetail').set({
          projectType: input.construction.projectType,
          requestedLoanAmount: decimalForColumn(input.loanAmount, 19, 4, 'loanAmount'),
          constructionMonths: input.construction.constructionMonths,
        }).where('scenarioId', '=', id).execute();
      } else if (input.productFamily === 'dscr' && input.dscr) {
        await trx.updateTable('lending.DscrScenarioDetail').set({
          requestedLoanAmount: decimalForColumn(input.loanAmount, 19, 4, 'loanAmount'),
          monthlyRent: decimalForColumn(input.dscr.monthlyRent, 19, 4, 'dscr.monthlyRent'),
          monthlyExpenses: decimalForColumn(input.dscr.monthlyExpenses, 19, 4, 'dscr.monthlyExpenses'),
        }).where('scenarioId', '=', id).execute();
      }
      const revision = await trx.selectFrom('lending.ScenarioRevision').select(sql<number>`COALESCE(MAX(revisionNumber), 0)`.as('maxRevision')).where('scenarioId', '=', id).executeTakeFirstOrThrow();
      await trx.insertInto('lending.ScenarioRevision').values({
        id: randomUUID(), scenarioId: id, revisionNumber: Number(revision.maxRevision) + 1,
        snapshot: JSON.stringify({ ...input, metadataRevision: metadata?.id ?? 'unpublished' }), actorUserId: context.actor.type === 'user' ? context.actor.id : null,
      }).execute();
      const changes = [
        { field: 'name', before: existing.name, after: input.name },
        { field: 'loanAmount', before: existing.loanAmount, after: input.loanAmount },
        { field: 'interestRate', before: existing.interestRate, after: input.rate },
        { field: 'termMonths', before: existing.termMonths, after: input.termMonths },
        { field: 'metadataRevisionId', before: existing.metadataRevisionId, after: metadata?.id ?? null },
      ];
      await appendAudit(trx, context, { action: 'scenario.updated', entityType: 'LoanScenario', entityId: id, changes, metadataRevisionId: metadata?.id ?? null, productVersionId: existing.productVersionId });
      return await scenarioSelect(trx).where('s.id', '=', id).executeTakeFirstOrThrow() as ScenarioRow;
    });
    response.json(summary(updated));
  });

  router.post('/:scenarioId/pricing', requirePermission('scenarios.write'), async (request, response) => {
    const actorId = request.context?.actor?.id;
    const businessUnitId = request.context?.businessUnitId;
    if (options.flags && !(await options.flags.evaluate('illustrativePricing', { ...(actorId ? { actorId } : {}), ...(businessUnitId ? { businessUnitId } : {}) }))) throw new HttpProblem(404, 'not_found', 'Illustrative pricing is unavailable.');
    const id = zUuid(request.params.scenarioId);
    const { row, metadata } = await detail(db, id);
    const pricing = await db.selectFrom('lending.PricingVersion as pv')
      .innerJoin('lending.PricingConfiguration as pc', 'pc.id', 'pv.pricingConfigurationId')
      .select(['pv.id', 'pv.parameters', 'pv.versionNumber'])
      .where('pc.isActive', '=', true).orderBy('pv.createdAt', 'desc').executeTakeFirst();
    if (!pricing) throw new HttpProblem(503, 'dependency_timeout', 'No pricing version is configured.');
    const parameters = readJson(pricing.parameters as string) as { baseRate?: string; points?: string } | null;
    const rate = parameters?.baseRate ?? '0.082500';
    const points = parameters?.points ?? '1.0000';
    const inputs = { requestedLoanAmount: row.loanAmount, productVersionId: row.productVersionId, metadataRevisionId: metadata?.id ?? row.metadataRevisionId };
    const result = { rate, points, illustrative: true };
    const createdAt = new Date();
    const snapshotId = randomUUID();
    const context = request.context;
    if (!context?.actor) throw new HttpProblem(401, 'unauthorized', 'A valid session is required.');
    await withSerializable(db, async (trx) => {
      await trx.insertInto('lending.PricingResult').values({
        id: snapshotId, scenarioId: id, productVersionId: row.productVersionId!, pricingVersionId: pricing.id,
        metadataRevisionId: metadata?.id ?? row.metadataRevisionId ?? null, inputs: JSON.stringify(inputs), result: JSON.stringify(result), rate: decimalForColumn(rate, 9, 6, 'rate'), points: decimalForColumn(points, 9, 4, 'points'), createdAt,
      }).execute();
      await appendAudit(trx, context, { action: 'scenario.priced', entityType: 'LoanScenario', entityId: id, changes: [{ field: 'pricingSnapshotId', after: snapshotId }], metadataRevisionId: metadata?.id ?? row.metadataRevisionId ?? null, productVersionId: row.productVersionId, pricingVersionId: pricing.id });
    });
    response.status(201).json(pricingSnapshotSchema.parse({ snapshotId, scenarioId: id, productVersionId: row.productVersionId, pricingVersionId: pricing.id, metadataRevisionId: metadata?.id ?? row.metadataRevisionId ?? null, inputs, result, createdAt: createdAt.toISOString() }));
  });

  router.post('/internal/integration-events', requirePermission('scenarios.write'), async (request, response) => {
    const body = integrationDecisionRequestSchema.parse(request.body);
    const context = request.context;
    if (!context?.actor || context.actor.type !== 'service') throw new HttpProblem(403, 'forbidden', 'A service identity is required.');
    const saved = await withSerializable(db, async (trx) => {
      const scenario = await trx.selectFrom('lending.LoanScenario').select(['id', 'status', 'version', 'productVersionId', 'metadataRevisionId']).where('id', '=', body.scenarioId).executeTakeFirst();
      if (!scenario) throw new HttpProblem(404, 'not_found', 'The scenario was not found.');
      if (scenario.status === body.decision) return { changed: false, status: scenario.status };
      if (scenario.status !== 'draft' && scenario.status !== 'submitted') throw new HttpProblem(409, 'conflict', 'The scenario cannot accept this provider decision in its current state.');
      const updated = await trx.updateTable('lending.LoanScenario').set({ status: body.decision, updatedAt: new Date() }).where('id', '=', body.scenarioId).where('version', '=', scenario.version as never).executeTakeFirst();
      if (Number(updated.numUpdatedRows ?? 0) !== 1) throw new HttpProblem(409, 'conflict', 'The scenario changed before the provider decision was recorded.');
      await appendAudit(trx, context, {
        action: 'scenario.provider_decision', entityType: 'LoanScenario', entityId: body.scenarioId,
        changes: [{ field: 'status', before: scenario.status, after: body.decision }, { field: 'providerReference', after: body.providerReference }],
        metadataRevisionId: scenario.metadataRevisionId, productVersionId: scenario.productVersionId,
      });
      return { changed: true, status: body.decision };
    });
    response.json(integrationDecisionResponseSchema.parse({ scenarioId: body.scenarioId, status: saved.status, changed: saved.changed }));
  });

  return router;
}

import { z } from 'zod';
function zUuid(value: string | undefined): string { const parsed = z.string().uuid().safeParse(value); if (!parsed.success) throw new HttpProblem(400, 'validation_failed', 'The scenario ID is invalid.'); return parsed.data; }
export function encodeListCursor(row: Pick<ScenarioRow, 'updatedAt' | 'name' | 'loanAmount' | 'id'>, sort: string, direction: 'asc' | 'desc', filters: { q: string | null; family: string | null; status: string | null }): string {
  const value = sort === 'updatedAt' ? row.updatedAt.toISOString() : sort === 'name' ? row.name : row.loanAmount;
  return Buffer.from(JSON.stringify({ sort, direction, filters, value, id: row.id })).toString('base64url');
}
export function decodeListCursor(value: string, expectedSort: string, expectedDirection: 'asc' | 'desc', expectedFilters: { q: string | null; family: string | null; status: string | null }): { value: string | Date; id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { sort?: unknown; direction?: unknown; filters?: unknown; value?: unknown; id?: unknown };
    if (decoded.sort !== expectedSort || decoded.direction !== expectedDirection || JSON.stringify(decoded.filters) !== JSON.stringify(expectedFilters) || typeof decoded.value !== 'string' || typeof decoded.id !== 'string' || !/^[0-9a-f-]{36}$/iu.test(decoded.id)) throw new Error();
    if (expectedSort === 'updatedAt') {
      const date = new Date(decoded.value);
      if (Number.isNaN(date.valueOf())) throw new Error();
      return { value: date, id: decoded.id };
    }
    if (expectedSort === 'loanAmount' && !/^-?\d+(\.\d+)?$/u.test(decoded.value)) throw new Error();
    return { value: decoded.value, id: decoded.id };
  } catch { throw new HttpProblem(400, 'validation_failed', 'The scenario cursor is invalid or does not match this sort.'); }
}
