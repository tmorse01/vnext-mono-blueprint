import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";
import { server } from "../../test/setup.js";
import { scenarioFixtures } from "../../mocks/fixtures.js";
import { ScenarioDetailPage } from "./ScenarioDetailPage.js";

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/scenarios/a705c1a5-59cd-4690-8b35-321a68e73a34"]}><Routes><Route path="/scenarios/:scenarioId" element={<ScenarioDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe("ScenarioDetailPage", () => {
  it("renders product-specific fields and serializes debounced scenario saves", async () => {
    const user = userEvent.setup();
    renderDetail();
    const nameField = await screen.findByRole("textbox", { name: /scenario name/i });
    expect(screen.getByRole("combobox", { name: /project type/i })).toBeInTheDocument();
    await user.clear(nameField);
    await user.type(nameField, "Oakridge Phase Two revised");
    await waitFor(() => expect(scenarioFixtures[0]?.edit.name).toBe("Oakridge Phase Two revised"), { timeout: 4000 });
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
  });

  it("retains local edits and stops autosave when the server reports a version conflict", async () => {
    server.use(http.put("*/api/scenarios/:scenarioId", () => HttpResponse.json({ title: "Version conflict", status: 409, code: "version_conflict", requestId: "request-conflict" }, { status: 409 })));
    const user = userEvent.setup();
    renderDetail();
    const nameField = await screen.findByRole("textbox", { name: /scenario name/i });
    await user.clear(nameField);
    await user.type(nameField, "Keep these local edits");
    expect(await screen.findByText(/changed elsewhere/i, {}, { timeout: 4_000 })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /scenario name/i })).toHaveValue("Keep these local edits");
  });
});
