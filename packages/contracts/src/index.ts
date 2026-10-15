import { z } from "zod";
import { metadataDocumentSchema } from "@vnext/metadata";

export const idSchema = z.uuid();
export const decimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/);
export const versionSchema = z.string().min(1).max(128);

export const problemDetailsSchema = z.object({
  type: z.string().optional(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: z.string(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().min(1),
  errors: z.array(z.object({
    field: z.string().optional(),
    message: z.string(),
  })).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
export const noContentSchema = z.undefined();

export const pageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().optional(),
  direction: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().max(200).optional(),
});

export const scenarioListQuerySchema = pageQuerySchema.extend({
  family: z.enum(["construction", "dscr"]).optional(),
  status: z.enum(["draft", "submitted", "approved", "declined"]).optional(),
});

export const pageSchema = <T extends z.ZodType>(item: T) => z.object({
  items: z.array(item),
  nextCursor: z.string().nullable(),
});

export const actorSchema = z.object({
  id: idSchema,
  type: z.enum(["user", "service"]),
  displayName: z.string().optional(),
});
export type ActorDto = z.infer<typeof actorSchema>;

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(256),
});

export const currentUserSchema = z.object({
  actor: actorSchema,
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  activeBusinessUnitId: idSchema.nullable(),
});
export type CurrentUserDto = z.infer<typeof currentUserSchema>;

export const scenarioSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  productFamily: z.enum(["construction", "dscr"]),
  status: z.enum(["draft", "submitted", "approved", "declined"]),
  loanAmount: decimalStringSchema,
  rate: decimalStringSchema.nullable(),
  termMonths: z.number().int().min(1).max(600).nullable(),
  updatedAt: z.iso.datetime(),
  version: versionSchema,
});
export type ScenarioSummaryDto = z.infer<typeof scenarioSummarySchema>;

const scenarioEditFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  loanAmount: decimalStringSchema,
  rate: decimalStringSchema.nullable(),
  termMonths: z.number().int().min(1).max(600).nullable(),
  productFamily: z.enum(["construction", "dscr"]),
  construction: z.object({
    projectType: z.enum(["ground_up", "renovation"]),
    constructionMonths: z.number().int().min(1).max(60),
  }).optional(),
  dscr: z.object({
    monthlyRent: decimalStringSchema,
    monthlyExpenses: decimalStringSchema,
  }).optional(),
});

function requireProductFamilyDetails(
  value: z.infer<typeof scenarioEditFieldsSchema>,
  ctx: z.RefinementCtx,
): void {
  if (value.productFamily === "construction" && !value.construction) {
    ctx.addIssue({ code: "custom", path: ["construction"], message: "Construction details are required." });
  }
  if (value.productFamily === "dscr" && !value.dscr) {
    ctx.addIssue({ code: "custom", path: ["dscr"], message: "DSCR details are required." });
  }
}

export const scenarioEditSchema = scenarioEditFieldsSchema.superRefine(requireProductFamilyDetails);
export const scenarioDetailEditSchema = scenarioEditFieldsSchema.extend({
  expectedVersion: versionSchema,
  metadataRevision: versionSchema,
}).superRefine(requireProductFamilyDetails);

export const effectiveMetadataRevisionSchema = z.object({
  id: versionSchema,
  productFamily: z.enum(["construction", "dscr"]),
  revisionNumber: z.number().int().nonnegative(),
  document: metadataDocumentSchema,
});

export const scenarioDetailSchema = z.object({
  scenario: scenarioSummarySchema,
  edit: scenarioDetailEditSchema,
  productVersionId: idSchema,
  metadataRevision: effectiveMetadataRevisionSchema.nullable(),
});
export type ScenarioDetailDto = z.infer<typeof scenarioDetailSchema>;

export const auditChangeSchema = z.object({
  field: z.string(),
  before: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  after: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

export const auditEventSchema = z.object({
  id: idSchema,
  occurredAt: z.iso.datetime(),
  actorId: z.string().nullable(),
  actorDisplayName: z.string().optional(),
  actorType: z.enum(["user", "service", "system"]),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  changes: z.array(auditChangeSchema),
  metadataRevisionId: versionSchema.nullable().optional(),
  productVersionId: idSchema.nullable().optional(),
  pricingVersionId: idSchema.nullable().optional(),
  requestId: z.string().optional(),
});
export const scenarioAuditPageSchema = pageSchema(auditEventSchema);
export type AuditEventDto = z.infer<typeof auditEventSchema>;

export const pricingSnapshotSchema = z.object({
  snapshotId: idSchema,
  scenarioId: idSchema,
  productVersionId: idSchema,
  pricingVersionId: idSchema,
  metadataRevisionId: versionSchema.nullable(),
  inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  result: z.object({ rate: decimalStringSchema, points: decimalStringSchema, illustrative: z.literal(true) }),
  createdAt: z.iso.datetime(),
});

export const scenarioUpdateRequestSchema = scenarioEditFieldsSchema.extend({
  // Older imported scenarios may not have these optional financial inputs yet.
  // Preserve null during edits instead of inventing values just to save another field.
  rate: decimalStringSchema.nullable(),
  termMonths: z.number().int().min(1).max(600).nullable(),
  expectedVersion: versionSchema,
  metadataRevision: versionSchema,
}).superRefine((value, ctx) => {
  requireProductFamilyDetails(value, ctx);
});
export type ScenarioUpdateRequest = z.infer<typeof scenarioUpdateRequestSchema>;

export const metadataRevisionContextSchema = z.object({
  environment: z.enum(["local", "preview", "production"]),
  productId: idSchema,
  businessUnitId: idSchema,
  revisionId: versionSchema,
});
export type MetadataRevisionContext = z.infer<typeof metadataRevisionContextSchema>;

export const metadataEnvironmentSchema = z.enum(["local", "preview", "production"]);
export const metadataRevisionSchema = z.object({
  id: versionSchema,
  productFamily: z.enum(["construction", "dscr"]),
  businessUnitId: idSchema.nullable(),
  revisionNumber: z.number().int().positive(),
  state: z.enum(["draft", "published", "superseded"]),
  version: versionSchema,
  document: metadataDocumentSchema,
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  environment: metadataEnvironmentSchema,
});
export type MetadataRevisionDto = z.infer<typeof metadataRevisionSchema>;

export const metadataContextQuerySchema = z.object({
  family: z.enum(["construction", "dscr"]),
  businessUnitId: idSchema.optional(),
});
export const metadataRevisionListQuerySchema = metadataContextQuerySchema.extend({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const metadataWorkspaceSchema = z.object({
  environment: metadataEnvironmentSchema,
  published: metadataRevisionSchema.nullable(),
  draft: metadataRevisionSchema.nullable(),
});
export const metadataRevisionPageSchema = pageSchema(metadataRevisionSchema);
export const metadataIssueSchema = z.string().max(500);
export const metadataValidationRequestSchema = z.object({
  productFamily: z.enum(["construction", "dscr"]),
  businessUnitId: idSchema.nullable().optional(),
  document: metadataDocumentSchema,
});
export const metadataValidationResultSchema = z.object({ valid: z.boolean(), issues: z.array(metadataIssueSchema) });
export const metadataDraftCreateRequestSchema = z.object({
  productFamily: z.enum(["construction", "dscr"]),
  businessUnitId: idSchema.nullable().optional(),
  document: metadataDocumentSchema.optional(),
  sourceRevisionId: versionSchema.optional(),
}).superRefine((value, context) => {
  if (!value.document && !value.sourceRevisionId) {
    context.addIssue({ code: "custom", path: ["document"], message: "Provide a document or source revision to copy." });
  }
});
export const metadataDraftUpdateRequestSchema = z.object({
  expectedVersion: versionSchema,
  document: metadataDocumentSchema,
});
export const metadataPreviewRequestSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export const metadataPreviewResultSchema = z.object({
  revisionId: versionSchema,
  document: metadataDocumentSchema,
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  valid: z.boolean(),
  issues: z.array(metadataIssueSchema),
});
export const metadataPublishRequestSchema = z.object({
  expectedVersion: versionSchema,
  expectedPublishedRevisionId: versionSchema.nullable(),
});
export const metadataDraftResponseSchema = metadataRevisionSchema;
export type MetadataWorkspaceDto = z.infer<typeof metadataWorkspaceSchema>;
export type MetadataPreviewDto = z.infer<typeof metadataPreviewResultSchema>;

export const integrationDecisionRequestSchema = z.object({
  scenarioId: idSchema,
  providerReference: z.string().trim().min(1).max(160),
  decision: z.enum(["approved", "declined"]),
});
export const integrationDecisionResponseSchema = z.object({
  scenarioId: idSchema,
  status: z.enum(["draft", "submitted", "approved", "declined", "processing"]),
  changed: z.boolean(),
});

export const endpointDefinitions = {
  login: { method: "POST", path: "/api/auth/login", request: loginRequestSchema, response: currentUserSchema },
  logout: { method: "POST", path: "/api/auth/logout", response: noContentSchema },
  currentUser: { method: "GET", path: "/api/auth/me", response: currentUserSchema },
  scenarios: { method: "GET", path: "/api/scenarios", query: scenarioListQuerySchema, response: pageSchema(scenarioSummarySchema) },
  scenario: { method: "GET", path: "/api/scenarios/{scenarioId}", response: scenarioDetailSchema },
  scenarioAudit: { method: "GET", path: "/api/scenarios/{scenarioId}/audit", response: scenarioAuditPageSchema },
  updateScenario: { method: "PUT", path: "/api/scenarios/{scenarioId}", request: scenarioUpdateRequestSchema, response: scenarioSummarySchema },
  pricingSnapshot: { method: "POST", path: "/api/scenarios/{scenarioId}/pricing", response: pricingSnapshotSchema },
  metadataWorkspace: { method: "GET", path: "/api/admin/metadata", query: metadataContextQuerySchema, response: metadataWorkspaceSchema },
  metadataRevisions: { method: "GET", path: "/api/admin/metadata/revisions", query: metadataRevisionListQuerySchema, response: metadataRevisionPageSchema },
  metadataAudit: { method: "GET", path: "/api/admin/metadata/{revisionId}/audit", response: scenarioAuditPageSchema },
  validateMetadata: { method: "POST", path: "/api/admin/metadata/validate", request: metadataValidationRequestSchema, response: metadataValidationResultSchema },
  createMetadataDraft: { method: "POST", path: "/api/admin/metadata/drafts", request: metadataDraftCreateRequestSchema, response: metadataDraftResponseSchema },
  updateMetadataDraft: { method: "PUT", path: "/api/admin/metadata/drafts/{revisionId}", request: metadataDraftUpdateRequestSchema, response: metadataDraftResponseSchema },
  previewMetadataDraft: { method: "POST", path: "/api/admin/metadata/drafts/{revisionId}/preview", request: metadataPreviewRequestSchema, response: metadataPreviewResultSchema },
  publishMetadataDraft: { method: "POST", path: "/api/admin/metadata/drafts/{revisionId}/publish", request: metadataPublishRequestSchema, response: metadataDraftResponseSchema },
  mockProviderCallback: { method: "POST", path: "/api/mock-provider/callback", request: integrationDecisionRequestSchema, response: integrationDecisionResponseSchema },
  applyIntegrationDecision: { method: "POST", path: "/api/scenarios/internal/integration-events", request: integrationDecisionRequestSchema, response: integrationDecisionResponseSchema },
} as const;
