import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { App } from "../../app/App.js";
import { resetMockMetadata } from "../../mocks/handlers.js";
import { server } from "../../test/setup.js";

describe("metadata workflow", () => {
  beforeEach(() => resetMockMetadata());

  it("edits a draft, validates it, and allows an authorized publish", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Metadata studio" })).toBeInTheDocument();

    const labelFields = await screen.findAllByRole("textbox", { name: "Label" });
    fireEvent.change(labelFields[0]!, { target: { value: "Project scenario" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Draft saved with a new version.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Validate draft" }));
    expect(await screen.findByText("Validation passed. This draft is ready to preview or publish.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish revision" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Publish revision" }));
    expect(await screen.findByText("Revision published. Existing revisions remain available for rollback.")).toBeInTheDocument();
  });

  it("disables editing controls when the current user lacks metadata.edit", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ actor: { id: "20000000-0000-4000-8000-000000000001", type: "user", displayName: "Read only" }, roles: ["viewer"], permissions: ["metadata.read"], activeBusinessUnitId: "10000000-0000-4000-8000-000000000001" })));
    render(<App />);
    expect(await screen.findByText(/read-only access/i)).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Label" })[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("shows published history and reverts a revision into a new draft", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "History & audit" }));
    expect(await screen.findByText("Revision 8")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revert to this" }));
    expect(await screen.findByText("Prior revision copied into a new draft. Review and publish it to make it active.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Draft editor" })).toHaveAttribute("aria-selected", "true");
  });

  it("loads a separate empty workspace when switching product scope", async () => {
    render(<App />);
    const familySelect = await screen.findByRole("combobox", { name: "Product family" });
    fireEvent.mouseDown(familySelect);
    fireEvent.click(await screen.findByRole("option", { name: "DSCR" }));
    expect(await screen.findByText("No revision exists for this scope")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "DSCR fields" })).toBeInTheDocument();
  });
});
