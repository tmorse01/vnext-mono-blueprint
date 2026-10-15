import { z } from "zod";
import { pageSchema, scenarioAuditPageSchema, scenarioDetailSchema, scenarioSummarySchema } from "@vnext/contracts";

export type ScenarioDetail = z.infer<typeof scenarioDetailSchema>;

export const scenarioPageSchema = pageSchema(scenarioSummarySchema);
export type ScenarioPage = z.infer<typeof scenarioPageSchema>;

export const auditPageSchema = scenarioAuditPageSchema;
export type AuditPage = z.infer<typeof scenarioAuditPageSchema>;

export interface ScenarioListParams {
  q?: string;
  status?: string;
  family?: string;
  sort?: string;
  direction?: "asc" | "desc";
  limit: number;
  cursor?: string;
}
