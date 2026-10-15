import { http, HttpResponse } from "msw";
import { currentUserSchema } from "@vnext/contracts";
import { metadataDocumentSchema } from "@vnext/metadata";
import type { MetadataDraft, MetadataRevision } from "../features/metadata/model.js";
import { defaultScope, initialDocument, makeDraft, mockAudit, mockRevision, toFixtureDto } from "../features/metadata/fixtures.js";

let draft: MetadataDraft | null = makeDraft();
let published: MetadataRevision | null = mockRevision;
let history: MetadataRevision[] = [mockRevision];
export function resetMockMetadata() { draft = makeDraft(); published = mockRevision; history = [mockRevision]; }
const user = currentUserSchema.parse({ actor: { id: "20000000-0000-4000-8000-000000000001", type: "user", displayName: "Morgan Lee" }, roles: ["configuration_admin"], permissions: ["metadata.edit", "metadata.publish", "audit.read"], activeBusinessUnitId: defaultScope.businessUnitId });
const parseDocument = (body: unknown) => {
  if (!body || typeof body !== "object" || !("document" in body)) return initialDocument;
  const parsed = metadataDocumentSchema.safeParse(body.document);
  return parsed.success ? parsed.data : initialDocument;
};
const scopeFrom = (url: URL) => ({ ...defaultScope, productFamily: url.searchParams.get("family") === "dscr" ? "dscr" as const : "construction" as const, businessUnitId: url.searchParams.get("businessUnitId") || null });
const filterHistory = (url: URL) => history.filter((revision) => revision.scope.productFamily === (url.searchParams.get("family") ?? "construction") && revision.scope.businessUnitId === (url.searchParams.get("businessUnitId") || null));
const responseRevision = (revision: MetadataDraft | MetadataRevision) => toFixtureDto(revision);

export const handlers = [
  http.get("*/api/auth/me", () => HttpResponse.json(user)),
  http.get("*/api/admin/metadata", ({ request }) => {
    const scope = scopeFrom(new URL(request.url));
    const scopedDraft = draft && draft.scope.productFamily === scope.productFamily && draft.scope.businessUnitId === scope.businessUnitId ? draft : null;
    const scopedPublished = published && published.scope.productFamily === scope.productFamily && published.scope.businessUnitId === scope.businessUnitId ? published : null;
    return HttpResponse.json({ environment: "local", published: scopedPublished ? responseRevision(scopedPublished) : null, draft: scopedDraft ? responseRevision(scopedDraft) : null });
  }),
  http.get("*/api/admin/metadata/revisions", ({ request }) => HttpResponse.json({ items: filterHistory(new URL(request.url)).map(responseRevision), nextCursor: null })),
  http.get("*/api/admin/metadata/:revisionId/audit", () => HttpResponse.json({ items: mockAudit.map((entry) => ({ id: entry.id, occurredAt: entry.occurredAt, actorId: "20000000-0000-4000-8000-000000000001", actorDisplayName: entry.actorDisplayName, actorType: "user", action: entry.action, entityType: "MetadataRevision", entityId: `construction-r${entry.revisionNumber ?? 9}`, changes: [{ field: entry.detail }], metadataRevisionId: String(entry.revisionNumber ?? 9) })), nextCursor: null })),
  http.post("*/api/admin/metadata/drafts", async ({ request }) => {
    const body: unknown = await request.json();
    const scope = body && typeof body === "object" && "productFamily" in body ? { ...defaultScope, productFamily: body.productFamily === "dscr" ? "dscr" as const : "construction" as const, businessUnitId: "businessUnitId" in body && typeof body.businessUnitId === "string" ? body.businessUnitId : null } : defaultScope;
    const sourceId = body && typeof body === "object" && "sourceRevisionId" in body ? String(body.sourceRevisionId) : undefined;
    const source = sourceId ? history.find((item) => item.id === sourceId) : undefined;
    draft = makeDraft(scope, { id: `draft-${Date.now()}`, document: source?.document ?? parseDocument(body), status: "draft", revisionNumber: (source?.revisionNumber ?? published?.revisionNumber ?? 0) + 1, version: `v${Date.now()}`, updatedAt: new Date().toISOString(), publishedAt: null });
    return HttpResponse.json(responseRevision(draft), { status: 201 });
  }),
  http.put("*/api/admin/metadata/drafts/:id", async ({ request, params }) => {
    const body: unknown = await request.json();
    if (!draft || params.id !== draft.id || !body || typeof body !== "object" || !("expectedVersion" in body) || body.expectedVersion !== draft.version) return HttpResponse.json({ type: "about:blank", title: "Version conflict", status: 409, code: "conflict", detail: "This draft changed since you opened it.", requestId: "mock-request-conflict" }, { status: 409 });
    draft = { ...draft, document: parseDocument(body), version: `v${Date.now()}`, updatedAt: new Date().toISOString() };
    return HttpResponse.json(responseRevision(draft));
  }),
  http.post("*/api/admin/metadata/validate", async ({ request }) => {
    const body: unknown = await request.json();
    const document = parseDocument(body);
    const family = body && typeof body === "object" && "productFamily" in body ? body.productFamily : "construction";
    const issues = document.fields.filter((field) => (field.key.startsWith("construction.") && family !== "construction") || (field.key.startsWith("dscr.") && family !== "dscr")).map((field) => `${field.key} is not available for this product family.`);
    return HttpResponse.json({ valid: issues.length === 0, issues });
  }),
  http.post("*/api/admin/metadata/drafts/:id/preview", async ({ request, params }) => {
    const body: unknown = await request.json();
    const values = body && typeof body === "object" && "values" in body && typeof body.values === "object" && body.values !== null ? body.values as Record<string, unknown> : {};
    return HttpResponse.json({ revisionId: String(params.id), document: draft?.document ?? initialDocument, values, valid: true, issues: [] });
  }),
  http.post("*/api/admin/metadata/drafts/:id/publish", async ({ request, params }) => {
    const body: unknown = await request.json();
    if (!draft || params.id !== draft.id || !body || typeof body !== "object" || !("expectedVersion" in body) || body.expectedVersion !== draft.version) return HttpResponse.json({ type: "about:blank", title: "Version conflict", status: 409, code: "conflict", detail: "This draft changed since you opened it.", requestId: "mock-request-conflict" }, { status: 409 });
    const justPublished: MetadataRevision = { id: draft.id, scope: draft.scope, state: "published", version: draft.version, revisionNumber: draft.revisionNumber, document: draft.document, createdAt: draft.updatedAt, publishedAt: new Date().toISOString(), actorDisplayName: "Morgan Lee" };
    history = history.map((revision) => revision.scope.productFamily === draft?.scope.productFamily && revision.scope.businessUnitId === draft?.scope.businessUnitId && revision.state === "published" ? { ...revision, state: "superseded" } : revision);
    published = justPublished;
    draft = null;
    history = [justPublished, ...history];
    return HttpResponse.json(responseRevision(justPublished));
  }),
];
