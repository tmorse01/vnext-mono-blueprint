import { ApiClient } from "@vnext/api-client";
import { currentUserSchema, loginRequestSchema, metadataDraftCreateRequestSchema, metadataDraftUpdateRequestSchema, metadataPreviewRequestSchema, metadataPublishRequestSchema, metadataValidationRequestSchema, scenarioAuditPageSchema } from "@vnext/contracts";
import type { MetadataScope, DraftWrite, MetadataDraft, MetadataRevision } from "./model.js";
import { fromRevisionDto, metadataScopeResponseSchema, previewResponseSchema, revisionDtoSchema, revisionsResponseSchema, toRevision, validationResponseSchema } from "./model.js";

const client = new ApiClient();
const scopeParams = (scope: MetadataScope) => { const query = new URLSearchParams({ family: scope.productFamily }); if (scope.businessUnitId) query.set("businessUnitId", scope.businessUnitId); return query.toString(); };
const withSignal = (signal?: AbortSignal): RequestInit => signal ? { signal } : {};
const post = (value: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(value) });

export const metadataKeys = {
  all: ["metadata-admin"] as const,
  drafts: (scope: MetadataScope) => ["metadata-admin", "drafts", scope] as const,
  revisions: (scope: MetadataScope) => ["metadata-admin", "revisions", scope] as const,
  audit: (scope: MetadataScope) => ["metadata-admin", "audit", scope] as const,
};

export async function getCurrentUser(signal?: AbortSignal) { return client.request("/api/auth/me", currentUserSchema, withSignal(signal)); }
export function login(email: string, password: string) {
  const credentials = loginRequestSchema.parse({ email, password });
  return client.request("/api/auth/login", currentUserSchema, post(credentials));
}
export async function getDrafts(scope: MetadataScope, signal?: AbortSignal): Promise<{ items: MetadataDraft[]; published: MetadataDraft | null; environment: MetadataScope["environment"] }> {
  const result = await client.request(`/api/admin/metadata?${scopeParams(scope)}`, metadataScopeResponseSchema, withSignal(signal));
  return { items: result.draft ? [fromRevisionDto(result.draft)] : [], published: result.published ? fromRevisionDto(result.published) : null, environment: result.environment };
}
export async function getRevisions(scope: MetadataScope, signal?: AbortSignal): Promise<{ items: MetadataRevision[]; nextCursor: string | null }> {
  const query = new URLSearchParams(scopeParams(scope)); query.set("limit", "50");
  const result = await client.request(`/api/admin/metadata/revisions?${query}`, revisionsResponseSchema, withSignal(signal));
  return { items: result.items.map(toRevision), nextCursor: result.nextCursor ?? null };
}
export async function getAudit(revisionId: string, signal?: AbortSignal) {
  const result = await client.request(`/api/admin/metadata/${encodeURIComponent(revisionId)}/audit?limit=50`, scenarioAuditPageSchema, withSignal(signal));
  return { items: result.items.map((item) => ({ id: item.id, occurredAt: item.occurredAt, actorDisplayName: item.actorDisplayName ?? item.actorId ?? "System", action: item.action, detail: item.changes.length ? item.changes.map((change) => change.field).join(", ") : `${item.entityType} ${item.entityId}` })) };
}
export async function saveDraft(id: string | undefined, write: DraftWrite) {
  const body = id ? metadataDraftUpdateRequestSchema.parse({ expectedVersion: write.expectedVersion, document: write.document }) : metadataDraftCreateRequestSchema.parse({ productFamily: write.scope.productFamily, businessUnitId: write.scope.businessUnitId, document: write.document });
  const path = id ? `/api/admin/metadata/drafts/${encodeURIComponent(id)}` : "/api/admin/metadata/drafts";
  const result = await client.request(path, revisionDtoSchema, { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
  return { draft: fromRevisionDto(result) };
}
export function validateDraft(scope: MetadataScope, document: DraftWrite["document"]) {
  return client.request("/api/admin/metadata/validate", validationResponseSchema, post(metadataValidationRequestSchema.parse({ productFamily: scope.productFamily, businessUnitId: scope.businessUnitId, document })));
}
export function previewDraft(id: string, values: Readonly<Record<string, unknown>>) {
  return client.request(`/api/admin/metadata/drafts/${encodeURIComponent(id)}/preview`, previewResponseSchema, post(metadataPreviewRequestSchema.parse({ values })));
}
export async function publishDraft(id: string, expectedVersion: string, expectedPublishedRevisionId: string | null) {
  const result = await client.request(`/api/admin/metadata/drafts/${encodeURIComponent(id)}/publish`, revisionDtoSchema, post(metadataPublishRequestSchema.parse({ expectedVersion, expectedPublishedRevisionId })));
  return { draft: fromRevisionDto(result) };
}
export async function createRevertedDraft(scope: MetadataScope, revisionId: string) {
  const body = metadataDraftCreateRequestSchema.parse({ productFamily: scope.productFamily, businessUnitId: scope.businessUnitId, sourceRevisionId: revisionId });
  const result = await client.request("/api/admin/metadata/drafts", revisionDtoSchema, post(body));
  return { draft: fromRevisionDto(result) };
}
