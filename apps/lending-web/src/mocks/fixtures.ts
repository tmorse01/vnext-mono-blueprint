import type { AuditPage, ScenarioDetail, ScenarioPage } from "../features/scenarios/model.js";

export const scenarioFixtures: ScenarioDetail[] = [
  {
    scenario: { id: "a705c1a5-59cd-4690-8b35-321a68e73a34", name: "Oakridge Townhomes · Phase II", productFamily: "construction", status: "draft", loanAmount: "4250000", rate: "9.25", termMonths: 18, updatedAt: "2026-10-13T19:40:00.000Z", version: "v3" },
    edit: { name: "Oakridge Townhomes · Phase II", loanAmount: "4250000", rate: "9.25", termMonths: 18, productFamily: "construction", construction: { projectType: "ground_up", constructionMonths: 14 } },
    productVersionId: "00000000-0000-4000-8000-000000000001", metadataRevision: { id: "construction-2026.10", productFamily: "construction", revisionNumber: 8, document: { schemaVersion: 1, fields: [], layout: { navigation: "standard" } } },
  },
  {
    scenario: { id: "ca3a20b4-9b11-4299-9e21-9f3179cb8859", name: "Juniper Ridge Apartments", productFamily: "dscr", status: "submitted", loanAmount: "1875000", rate: "8.5", termMonths: 360, updatedAt: "2026-10-13T17:10:00.000Z", version: "v5" },
    edit: { name: "Juniper Ridge Apartments", loanAmount: "1875000", rate: "8.5", termMonths: 360, productFamily: "dscr", dscr: { monthlyRent: "22400", monthlyExpenses: "6800" } },
    productVersionId: "00000000-0000-4000-8000-000000000002", metadataRevision: { id: "dscr-2026.10", productFamily: "dscr", revisionNumber: 4, document: { schemaVersion: 1, fields: [], layout: { navigation: "standard" } } },
  },
  {
    scenario: { id: "b92cfda8-df09-4e7a-810c-142b35ad2cb0", name: "Willow Creek Rebuild", productFamily: "construction", status: "approved", loanAmount: "3290000", rate: "9.0", termMonths: 24, updatedAt: "2026-10-12T22:05:00.000Z", version: "v2" },
    edit: { name: "Willow Creek Rebuild", loanAmount: "3290000", rate: "9.0", termMonths: 24, productFamily: "construction", construction: { projectType: "renovation", constructionMonths: 18 } },
    productVersionId: "00000000-0000-4000-8000-000000000003", metadataRevision: { id: "construction-2026.10", productFamily: "construction", revisionNumber: 8, document: { schemaVersion: 1, fields: [], layout: { navigation: "standard" } } },
  },
  {
    scenario: { id: "75d5616b-e10a-49d4-bf46-a2eeab0a2d16", name: "Harborview Fourplex", productFamily: "dscr", status: "draft", loanAmount: "960000", rate: "8.875", termMonths: 360, updatedAt: "2026-10-11T20:25:00.000Z", version: "v1" },
    edit: { name: "Harborview Fourplex", loanAmount: "960000", rate: "8.875", termMonths: 360, productFamily: "dscr", dscr: { monthlyRent: "12600", monthlyExpenses: "3925" } },
    productVersionId: "00000000-0000-4000-8000-000000000004", metadataRevision: { id: "dscr-2026.10", productFamily: "dscr", revisionNumber: 4, document: { schemaVersion: 1, fields: [], layout: { navigation: "standard" } } },
  },
];

const originalScenarios = scenarioFixtures.map((scenario) => structuredClone(scenario));
export function resetScenarioFixtures() {
  scenarioFixtures.splice(0, scenarioFixtures.length, ...originalScenarios.map((scenario) => structuredClone(scenario)));
}

export const auditFixture: AuditPage = {
  items: [
    { id: "00000000-0000-4000-8000-000000000101", occurredAt: "2026-10-13T19:40:00.000Z", actorId: "00000000-0000-4000-8000-000000000201", actorType: "user", actorDisplayName: "Morgan Lee", action: "scenario.updated", entityType: "scenario", entityId: "a705c1a5-59cd-4690-8b35-321a68e73a34", changes: [{ field: "loanAmount", before: "4100000", after: "4250000" }, { field: "construction.constructionMonths", before: 12, after: 14 }] },
    { id: "00000000-0000-4000-8000-000000000102", occurredAt: "2026-10-12T18:10:00.000Z", actorId: "00000000-0000-4000-8000-000000000201", actorType: "user", actorDisplayName: "Morgan Lee", action: "scenario.created", entityType: "scenario", entityId: "a705c1a5-59cd-4690-8b35-321a68e73a34", changes: [{ field: "name", after: "Oakridge Townhomes · Phase II" }] },
  ],
  nextCursor: null,
};

export function toPage(items: ScenarioDetail[], cursor?: string): ScenarioPage {
  const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const rows = items.slice(start, start + 3);
  return { items: rows.map(({ scenario }) => scenario), nextCursor: start + 3 < items.length ? String(start + 3) : null };
}
