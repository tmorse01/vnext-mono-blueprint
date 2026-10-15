import { useLocation, MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ScenarioListPage } from "./ScenarioListPage.js";

function LocationLabel() {
  const location = useLocation();
  return <output data-testid="search-state">{location.search}</output>;
}

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><ScenarioListPage /><LocationLabel /></MemoryRouter></QueryClientProvider>);
}

describe("ScenarioListPage", () => {
  it("loads the seeded scenarios and persists search state in the URL", async () => {
    const user = userEvent.setup();
    renderList();
    expect(await screen.findByText("Oakridge Townhomes · Phase II")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search scenarios" }), "Juniper");
    await waitFor(() => expect(screen.getByTestId("search-state")).toHaveTextContent("q=Juniper"));
    expect(await screen.findByText("Juniper Ridge Apartments")).toBeInTheDocument();
  });
});
