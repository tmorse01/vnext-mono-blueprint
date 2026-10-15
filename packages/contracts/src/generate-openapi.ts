import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditEventSchema, currentUserSchema, integrationDecisionRequestSchema, integrationDecisionResponseSchema, loginRequestSchema, metadataContextQuerySchema, metadataDraftCreateRequestSchema, metadataDraftResponseSchema, metadataDraftUpdateRequestSchema, metadataPreviewRequestSchema, metadataPreviewResultSchema, metadataPublishRequestSchema, metadataRevisionListQuerySchema, metadataRevisionPageSchema, metadataRevisionSchema, metadataValidationRequestSchema, metadataValidationResultSchema, metadataWorkspaceSchema, pageQuerySchema, pageSchema, pricingSnapshotSchema, problemDetailsSchema, scenarioDetailSchema, scenarioListQuerySchema, scenarioSummarySchema, scenarioUpdateRequestSchema, scenarioAuditPageSchema } from "./index.js";

const registry = new OpenAPIRegistry();
registry.register("ProblemDetails", problemDetailsSchema);
registry.register("CurrentUser", currentUserSchema);
registry.register("ScenarioSummary", scenarioSummarySchema);
registry.register("ScenarioPage", pageSchema(scenarioSummarySchema));
registry.register("ScenarioDetail", scenarioDetailSchema);
registry.register("ScenarioAuditPage", scenarioAuditPageSchema);
registry.register("AuditEvent", auditEventSchema);
registry.register("PricingSnapshot", pricingSnapshotSchema);
registry.register("MetadataRevision", metadataRevisionSchema);
registry.register("MetadataWorkspace", metadataWorkspaceSchema);
registry.register("MetadataRevisionPage", metadataRevisionPageSchema);
registry.register("MetadataPreview", metadataPreviewResultSchema);
registry.register("IntegrationDecision", integrationDecisionRequestSchema);
registry.register("IntegrationDecisionResult", integrationDecisionResponseSchema);
registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  summary: "Create an opaque server-side session",
  request: { body: { content: { "application/json": { schema: loginRequestSchema } } } },
  responses: { 200: { description: "Authenticated user", content: { "application/json": { schema: currentUserSchema } } }, 401: { description: "Invalid credentials", content: { "application/problem+json": { schema: problemDetailsSchema } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  summary: "Revoke the current session",
  responses: { 204: { description: "Session revoked" } },
});
registry.registerPath({
  method: "get",
  path: "/api/auth/me",
  summary: "Return the current authenticated user",
  responses: {
    200: { description: "Current user", content: { "application/json": { schema: currentUserSchema } } },
    401: { description: "Authentication required", content: { "application/problem+json": { schema: problemDetailsSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/scenarios",
  summary: "List scenarios",
  request: { query: scenarioListQuerySchema },
  responses: {
    200: { description: "Scenario page", content: { "application/json": { schema: pageSchema(scenarioSummarySchema) } } },
    401: { description: "Authentication required", content: { "application/problem+json": { schema: problemDetailsSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/scenarios/{scenarioId}",
  summary: "Read a scenario and its effective metadata revision",
  request: { params: z.object({ scenarioId: z.uuid() }) },
  responses: {
    200: { description: "Scenario edit model", content: { "application/json": { schema: scenarioDetailSchema } } },
    404: { description: "Scenario not found", content: { "application/problem+json": { schema: problemDetailsSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/scenarios/{scenarioId}/audit",
  summary: "List scenario audit events",
  request: { params: z.object({ scenarioId: z.uuid() }), query: pageQuerySchema },
  responses: {
    200: { description: "Audit event page", content: { "application/json": { schema: scenarioAuditPageSchema } } },
    401: { description: "Authentication required", content: { "application/problem+json": { schema: problemDetailsSchema } } },
  },
});
registry.registerPath({
  method: "put",
  path: "/api/scenarios/{scenarioId}",
  summary: "Update a scenario with optimistic concurrency",
  request: {
    params: z.object({ scenarioId: z.uuid() }),
    body: { content: { "application/json": { schema: scenarioUpdateRequestSchema } } },
  },
  responses: {
    200: { description: "Updated scenario", content: { "application/json": { schema: scenarioSummarySchema } } },
    409: { description: "Version or metadata conflict", content: { "application/problem+json": { schema: problemDetailsSchema } } },
    422: { description: "Request validation failed", content: { "application/problem+json": { schema: problemDetailsSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/scenarios/{scenarioId}/pricing",
  summary: "Save an illustrative pricing snapshot",
  request: { params: z.object({ scenarioId: z.uuid() }) },
  responses: {
    201: { description: "Saved pricing snapshot", content: { "application/json": { schema: pricingSnapshotSchema } } },
    409: { description: "Scenario version conflict", content: { "application/problem+json": { schema: problemDetailsSchema } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/admin/metadata",
  summary: "Read the published and draft metadata for a scope",
  request: { query: metadataContextQuerySchema },
  responses: { 200: { description: "Metadata workspace", content: { "application/json": { schema: metadataWorkspaceSchema } } } },
});
registry.registerPath({
  method: "get",
  path: "/api/admin/metadata/revisions",
  summary: "List metadata revisions for a scope",
  request: { query: metadataRevisionListQuerySchema },
  responses: { 200: { description: "Metadata revisions", content: { "application/json": { schema: metadataRevisionPageSchema } } } },
});
registry.registerPath({
  method: "get",
  path: "/api/admin/metadata/{revisionId}/audit",
  summary: "List audit events associated with a metadata revision",
  request: { params: z.object({ revisionId: z.string() }), query: pageQuerySchema },
  responses: { 200: { description: "Metadata audit events", content: { "application/json": { schema: scenarioAuditPageSchema } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/admin/metadata/validate",
  summary: "Validate a metadata document against known fields",
  request: { body: { content: { "application/json": { schema: metadataValidationRequestSchema } } } },
  responses: { 200: { description: "Validation result", content: { "application/json": { schema: metadataValidationResultSchema } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/admin/metadata/drafts",
  summary: "Create a metadata draft, optionally copied from a prior revision",
  request: { body: { content: { "application/json": { schema: metadataDraftCreateRequestSchema } } } },
  responses: { 201: { description: "Created draft", content: { "application/json": { schema: metadataDraftResponseSchema } } } },
});
registry.registerPath({
  method: "put",
  path: "/api/admin/metadata/drafts/{revisionId}",
  summary: "Update a draft with optimistic concurrency",
  request: { params: z.object({ revisionId: z.string() }), body: { content: { "application/json": { schema: metadataDraftUpdateRequestSchema } } } },
  responses: { 200: { description: "Updated draft", content: { "application/json": { schema: metadataDraftResponseSchema } } }, 409: { description: "Draft changed elsewhere", content: { "application/problem+json": { schema: problemDetailsSchema } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/admin/metadata/drafts/{revisionId}/preview",
  summary: "Preview a draft using explicit sample values",
  request: { params: z.object({ revisionId: z.string() }), body: { content: { "application/json": { schema: metadataPreviewRequestSchema } } } },
  responses: { 200: { description: "Preview result", content: { "application/json": { schema: metadataPreviewResultSchema } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/admin/metadata/drafts/{revisionId}/publish",
  summary: "Publish a validated draft with optimistic concurrency",
  request: { params: z.object({ revisionId: z.string() }), body: { content: { "application/json": { schema: metadataPublishRequestSchema } } } },
  responses: { 200: { description: "Published revision", content: { "application/json": { schema: metadataDraftResponseSchema } } }, 409: { description: "Draft or published pointer changed", content: { "application/problem+json": { schema: problemDetailsSchema } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/mock-provider/callback",
  summary: "Accept an authenticated, idempotent mock-provider decision",
  request: { body: { content: { "application/json": { schema: integrationDecisionRequestSchema } } } },
  responses: { 200: { description: "Applied or repeated decision", content: { "application/json": { schema: integrationDecisionResponseSchema } } }, 202: { description: "An identical delivery is already processing" }, 409: { description: "Idempotency key conflict or prior failed delivery", content: { "application/problem+json": { schema: problemDetailsSchema } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/scenarios/internal/integration-events",
  summary: "Apply a provider decision through the narrow integration service identity",
  request: { body: { content: { "application/json": { schema: integrationDecisionRequestSchema } } } },
  responses: { 200: { description: "Decision result", content: { "application/json": { schema: integrationDecisionResponseSchema } } }, 403: { description: "Service identity required", content: { "application/problem+json": { schema: problemDetailsSchema } } } },
});

const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.3",
  info: { title: "VNext Lending API", version: "0.1.0", description: "Synthetic reference API; all monetary values are decimal strings." },
  servers: [{ url: "http://localhost:3001" }],
});
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const output = resolve(currentDirectory, "../../../docs/openapi.json");
const generated = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let existing: string;
  try { existing = await readFile(output, "utf8"); }
  catch { throw new Error(`OpenAPI baseline is missing at ${output}; run pnpm api:generate and commit the generated document.`); }
  if (existing !== generated) throw new Error(`OpenAPI drift detected at ${output}; run pnpm api:generate and review the change.`);
  console.log(`OpenAPI contract is current: ${output}`);
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, generated, "utf8");
  console.log(`Generated ${output}`);
}
