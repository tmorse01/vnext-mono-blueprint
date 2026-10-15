import { ApiClient } from "@vnext/api-client";
import { scenarioSummarySchema, scenarioUpdateRequestSchema } from "@vnext/contracts";
import type { ScenarioSummaryDto, ScenarioUpdateRequest } from "@vnext/contracts";
import type { AuditPage, ScenarioDetail, ScenarioListParams, ScenarioPage } from "./model.js";
import { auditPageSchema, scenarioDetailSchema, scenarioPageSchema } from "./model.js";

const api = new ApiClient();

function buildQuery(params: ScenarioListParams): string {
  const query = new URLSearchParams();
  query.set("limit", String(params.limit));
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.family) query.set("family", params.family);
  if (params.sort) query.set("sort", params.sort);
  if (params.direction) query.set("direction", params.direction);
  if (params.cursor) query.set("cursor", params.cursor);
  return query.toString();
}

export const scenarioKeys = {
  all: ["scenarios"] as const,
  list: (params: ScenarioListParams) => ["scenarios", "list", params] as const,
  detail: (id: string) => ["scenarios", "detail", id] as const,
  audit: (id: string) => ["scenarios", "audit", id] as const,
};

export function getScenarios(params: ScenarioListParams, signal?: AbortSignal): Promise<ScenarioPage> {
  return api.request(`/api/scenarios?${buildQuery(params)}`, scenarioPageSchema, { signal });
}

export function getScenario(id: string, signal?: AbortSignal): Promise<ScenarioDetail> {
  return api.request(`/api/scenarios/${encodeURIComponent(id)}`, scenarioDetailSchema, { signal });
}

export function saveScenario(id: string, payload: ScenarioUpdateRequest, signal?: AbortSignal): Promise<ScenarioSummaryDto> {
  return api.request(`/api/scenarios/${encodeURIComponent(id)}`, scenarioSummarySchema, {
    method: "PUT",
    body: JSON.stringify(scenarioUpdateRequestSchema.parse(payload)),
    signal,
  });
}

export function getScenarioAudit(id: string, cursor?: string, signal?: AbortSignal): Promise<AuditPage> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  return api.request(`/api/scenarios/${encodeURIComponent(id)}/audit?${query.toString()}`, auditPageSchema, { signal });
}
