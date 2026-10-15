import { metadataDocumentSchema } from "@vnext/metadata";
import type { MetadataDocument } from "@vnext/metadata";
import { metadataPreviewResultSchema, metadataRevisionSchema, metadataRevisionPageSchema, metadataValidationResultSchema, metadataWorkspaceSchema } from "@vnext/contracts";
import { z } from "zod";

export const productFamilySchema = z.enum(["construction", "dscr"]);
export type ProductFamily = z.infer<typeof productFamilySchema>;
export const scopeSchema = z.object({ environment: z.enum(["local", "preview", "production"]), productFamily: productFamilySchema, businessUnitId: z.string().uuid().nullable() });
export type MetadataScope = z.infer<typeof scopeSchema>;
export const draftSchema = z.object({ id: z.string().min(1), scope: scopeSchema, status: z.enum(["draft", "published"]), revisionNumber: z.number().int().nonnegative(), document: metadataDocumentSchema, version: z.string().min(1), updatedAt: z.string().datetime(), publishedAt: z.string().datetime().nullable() });
export type MetadataDraft = z.infer<typeof draftSchema>;
export const revisionSchema = z.object({ id: z.string().min(1), scope: scopeSchema, revisionNumber: z.number().int().positive(), document: metadataDocumentSchema, createdAt: z.string().datetime(), publishedAt: z.string().datetime().nullable(), state: z.enum(["draft", "published", "superseded"]), version: z.string(), actorDisplayName: z.string().optional() });
export type MetadataRevision = z.infer<typeof revisionSchema>;
export const auditEntrySchema = z.object({ id: z.string(), occurredAt: z.string().datetime(), actorDisplayName: z.string(), action: z.string(), detail: z.string(), revisionNumber: z.number().int().nonnegative().optional() });
export type MetadataAuditEntry = z.infer<typeof auditEntrySchema>;
export const validationResponseSchema = metadataValidationResultSchema;
export const revisionDtoSchema = metadataRevisionSchema;
export type RevisionDto = z.infer<typeof revisionDtoSchema>;
export const metadataScopeResponseSchema = metadataWorkspaceSchema;
export const revisionsResponseSchema = metadataRevisionPageSchema;
export const previewResponseSchema = metadataPreviewResultSchema;
export const draftWriteSchema = z.object({ scope: scopeSchema, expectedVersion: z.string().optional(), document: metadataDocumentSchema });
export type DraftWrite = z.infer<typeof draftWriteSchema>;

export const knownFieldKeys = new Set(["name", "loanAmount", "rate", "termMonths", "construction.projectType", "construction.constructionMonths", "dscr.monthlyRent", "dscr.monthlyExpenses"]);

export const emptyDocument = (): MetadataDocument => metadataDocumentSchema.parse({ schemaVersion: 1, fields: [], layout: { navigation: "standard" } });

export function fromRevisionDto(dto: RevisionDto) {
  return draftSchema.parse({ id: dto.id, scope: { environment: dto.environment, productFamily: dto.productFamily, businessUnitId: dto.businessUnitId }, status: dto.state === "draft" ? "draft" : "published", revisionNumber: dto.revisionNumber, document: dto.document, version: dto.version, updatedAt: dto.createdAt, publishedAt: dto.publishedAt });
}
export function toRevision(dto: RevisionDto): MetadataRevision {
  return revisionSchema.parse({ id: dto.id, scope: { environment: dto.environment, productFamily: dto.productFamily, businessUnitId: dto.businessUnitId }, revisionNumber: dto.revisionNumber, document: dto.document, createdAt: dto.createdAt, publishedAt: dto.publishedAt, state: dto.state, version: dto.version });
}
