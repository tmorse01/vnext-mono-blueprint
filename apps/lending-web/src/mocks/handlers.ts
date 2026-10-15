import { http, HttpResponse } from "msw";
import { currentUserSchema, scenarioUpdateRequestSchema } from "@vnext/contracts";
import { auditFixture, scenarioFixtures, toPage } from "./fixtures.js";

const demoUser = currentUserSchema.parse({
  actor: { id: "00000000-0000-4000-8000-000000000201", type: "user", displayName: "Jordan Example" },
  roles: ["local-developer"],
  permissions: ["scenarios.read", "scenarios.write", "audit.read"],
  activeBusinessUnitId: "00000000-0000-4000-8000-000000000301",
});

export const handlers = [
  http.get("*/api/auth/me", () => HttpResponse.json(demoUser)),
  http.post("*/api/auth/login", () => HttpResponse.json(demoUser)),
  http.post("*/api/auth/logout", () => new HttpResponse(null, { status: 204 })),
  http.get("*/api/scenarios", ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams;
    const q = (query.get("q") ?? "").toLocaleLowerCase();
    const status = query.get("status");
    const family = query.get("family");
    const filtered = scenarioFixtures.filter((scenario) => (!q || scenario.name.toLocaleLowerCase().includes(q)) && (!status || scenario.status === status) && (!family || scenario.productFamily === family));
    return HttpResponse.json(toPage(filtered, query.get("cursor") ?? undefined));
  }),
  http.get("*/api/scenarios/:scenarioId", ({ params }) => {
    const scenario = scenarioFixtures.find((entry) => entry.scenario.id === params.scenarioId);
    return scenario ? HttpResponse.json(scenario) : HttpResponse.json({ title: "Scenario not found", status: 404, code: "not_found", requestId: "mock-request" }, { status: 404 });
  }),
  http.put("*/api/scenarios/:scenarioId", async ({ params, request }) => {
    const index = scenarioFixtures.findIndex((entry) => entry.scenario.id === params.scenarioId);
    const detail = scenarioFixtures[index];
    if (!detail) return HttpResponse.json({ title: "Scenario not found", status: 404, code: "not_found", requestId: "mock-request" }, { status: 404 });
    const raw: unknown = await request.json();
    const parsed = scenarioUpdateRequestSchema.safeParse(raw);
    if (!parsed.success) return HttpResponse.json({ title: "Invalid request", status: 422, code: "validation_error", requestId: "mock-request" }, { status: 422 });
    if (parsed.data.expectedVersion !== detail.scenario.version) return HttpResponse.json({ title: "Conflict", status: 409, code: "version_conflict", requestId: "mock-request" }, { status: 409 });
    const updated = { ...detail.scenario, ...parsed.data, version: `v${Number.parseInt(detail.scenario.version.slice(1), 10) + 1}`, updatedAt: new Date().toISOString() };
    scenarioFixtures[index] = { ...detail, scenario: updated, edit: { ...detail.edit, ...parsed.data } };
    return HttpResponse.json(updated);
  }),
  http.get("*/api/scenarios/:scenarioId/audit", () => HttpResponse.json(auditFixture)),
];
