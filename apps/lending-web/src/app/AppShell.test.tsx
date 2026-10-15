import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/setup.js";
import { AppShell } from "./AppShell.js";

describe("AppShell", () => {
  it("gates workspace access behind the server session and signs in without browser token storage", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ title: "Unauthorized", status: 401, code: "unauthorized", requestId: "test-401" }, { status: 401 })));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><MemoryRouter><AppShell /></MemoryRouter></QueryClientProvider>);
    await user.type(await screen.findByLabelText("Password"), "local-demo-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Jordan Example")).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
  });
});
