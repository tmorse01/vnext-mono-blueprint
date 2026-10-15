import { metadataDocumentSchema } from "@vnext/metadata";
import type { MetadataAuditEntry, MetadataDraft, MetadataRevision, MetadataScope, RevisionDto } from "./model.js";

export const defaultScope: MetadataScope = { environment: "local", productFamily: "construction", businessUnitId: null };
export const initialDocument = metadataDocumentSchema.parse({ schemaVersion: 1, layout: { navigation: "standard" }, fields: [
  { key: "name", label: "Scenario name", description: "A short name used across the pipeline.", group: "Overview", order: 0, widget: "text", required: true, maxLength: 120, tableColumn: true },
  { key: "loanAmount", label: "Requested loan amount", description: "Total requested principal in US dollars.", group: "Loan terms", order: 1, widget: "currency", required: true, min: 25000, max: 50000000, tableColumn: true },
  { key: "rate", label: "Interest rate", group: "Loan terms", order: 2, widget: "percent", required: true, min: 0, max: 30 },
  { key: "construction.projectType", label: "Project type", group: "Project", order: 3, widget: "select", required: true, options: [{ value: "ground_up", label: "Ground-up" }, { value: "renovation", label: "Renovation" }] },
  { key: "construction.constructionMonths", label: "Construction months", group: "Project", order: 4, widget: "number", required: true, min: 1, max: 60 },
] });

export function makeDraft(scope = defaultScope, overrides: Partial<MetadataDraft> = {}): MetadataDraft {
  return { id: "draft-construction-bu1", scope, status: "draft", revisionNumber: 9, document: initialDocument, version: "v9-01", updatedAt: "2026-10-14T19:30:00.000Z", publishedAt: null, ...overrides };
}

export const mockRevision: MetadataRevision = { id: "construction-r8", scope: defaultScope, revisionNumber: 8, document: initialDocument, createdAt: "2026-10-10T18:00:00.000Z", publishedAt: "2026-10-10T18:00:00.000Z", state: "published", version: "v8", actorDisplayName: "Morgan Lee" };
export function toFixtureDto(value: MetadataDraft | MetadataRevision): RevisionDto {
  return { id: value.id, productFamily: value.scope.productFamily, businessUnitId: value.scope.businessUnitId, revisionNumber: value.revisionNumber, state: "status" in value ? value.status : value.state, version: value.version, document: value.document, createdAt: "updatedAt" in value ? value.updatedAt : value.createdAt, publishedAt: value.publishedAt, environment: value.scope.environment };
}
export const mockAudit: MetadataAuditEntry[] = [
  { id: "audit-01", occurredAt: "2026-10-14T19:30:00.000Z", actorDisplayName: "Morgan Lee", action: "draft.updated", detail: "Changed requested loan amount label", revisionNumber: 9 },
  { id: "audit-02", occurredAt: "2026-10-10T18:00:00.000Z", actorDisplayName: "Avery Chen", action: "revision.published", detail: "Published construction metadata revision 8", revisionNumber: 8 },
];
