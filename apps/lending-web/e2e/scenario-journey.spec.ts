import { expect, test } from "@playwright/test";

const id = "a705c1a5-59cd-4690-8b35-321a68e73a34";
const scenario = { id, name: "Oakridge Townhomes · Phase II", productFamily: "construction", status: "draft", loanAmount: "4250000", rate: "9.25", termMonths: 18, updatedAt: "2026-10-13T19:40:00.000Z", version: "v3" };
const detail = {
  scenario,
  edit: { name: scenario.name, loanAmount: scenario.loanAmount, rate: scenario.rate, termMonths: scenario.termMonths, productFamily: "construction", construction: { projectType: "ground_up", constructionMonths: 14 } },
  productVersionId: "00000000-0000-4000-8000-000000000001",
  metadataRevision: { id: "construction-2026.10", productFamily: "construction", revisionNumber: 8, document: { schemaVersion: 1, fields: [], layout: { navigation: "standard" } } },
};

test("edit a construction scenario and inspect its audit history", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { actor: { id: "00000000-0000-4000-8000-000000000201", type: "user", displayName: "Jordan Example" }, roles: ["local-developer"], permissions: ["scenarios.read", "scenarios.write", "audit.read"], activeBusinessUnitId: "00000000-0000-4000-8000-000000000301" } }));
  await page.route("**/api/scenarios**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/audit")) {
      await route.fulfill({ json: { items: [{ id: "00000000-0000-4000-8000-000000000101", occurredAt: "2026-10-13T19:40:00.000Z", actorId: "actor-1", actorType: "user", actorDisplayName: "Morgan Lee", action: "scenario.updated", entityType: "scenario", entityId: id, changes: [{ field: "loanAmount", before: "4100000", after: "4250000" }] }], nextCursor: null } });
    } else if (url.pathname.endsWith(`/${id}`) && route.request().method() === "GET") {
      await route.fulfill({ json: detail });
    } else if (url.pathname.endsWith(`/${id}`) && route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { name: string; loanAmount: string };
      await route.fulfill({ json: { ...scenario, name: body.name, loanAmount: body.loanAmount, version: "v4", updatedAt: new Date().toISOString() } });
    } else {
      await route.fulfill({ json: { items: [scenario], nextCursor: null } });
    }
  });

  await page.goto("/scenarios");
  await page.getByRole("link", { name: scenario.name }).click();
  const name = page.getByRole("textbox", { name: /scenario name/i });
  await name.fill("Oakridge Phase Two revised");
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("link", { name: "Audit history" }).click();
  await expect(page.getByRole("heading", { name: "Audit history" })).toBeVisible();
  await expect(page.getByText("Morgan Lee")).toBeVisible();
  await expect(page.getByText("4100000")).toBeVisible();
});
