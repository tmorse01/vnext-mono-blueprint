import { describe, expect, it } from "vitest";
import { evaluateCondition, metadataDocumentSchema, resolveMetadata, validateMetadataAgainstRegistry } from "./index.js";

const known = new Set(["loanAmount", "projectType"]);

describe("closed metadata rules", () => {
  it("merges supported layers by stable field key and applies safe defaults", () => {
    const resolved = resolveMetadata(
      { fields: [{ key: "loanAmount", label: "Loan amount", order: 1, widget: "currency" }] },
      { fields: [{ key: "loanAmount", label: "Requested amount", order: 1, widget: "currency", tableColumn: true }] },
    );

    expect(resolved.fields).toHaveLength(1);
    expect(resolved.fields[0]).toMatchObject({ key: "loanAmount", label: "Requested amount", required: false, tableColumn: true, filterable: false });
  });

  it("evaluates only the supported condition operators", () => {
    expect(evaluateCondition({ operator: "greaterThan", field: "loanAmount", value: 100 }, { loanAmount: 150 })).toBe(true);
    expect(evaluateCondition({ operator: "in", field: "projectType", value: ["ground_up", "renovation"] }, { projectType: "renovation" })).toBe(true);
    expect(evaluateCondition({ operator: "greaterThan", field: "loanAmount", value: 100 }, { loanAmount: "150" })).toBe(false);
  });

  it("rejects visibility rules that reference fields outside the registry", () => {
    const document = metadataDocumentSchema.parse({
      schemaVersion: 1,
      fields: [{ key: "loanAmount", label: "Loan amount", order: 1, widget: "currency", visibleWhen: { operator: "equals", field: "adminExpression", value: "anything" } }],
    });

    expect(validateMetadataAgainstRegistry(document, known)).toContain("Unknown visibility condition field: adminExpression");
  });

  it("rejects a select default that is not one of its declared options", () => {
    expect(() => metadataDocumentSchema.parse({
      schemaVersion: 1,
      fields: [{ key: "projectType", label: "Project type", order: 1, widget: "select", options: [{ value: "ground_up", label: "Ground-up" }], defaultValue: "renovation" }],
    })).toThrow(/defaultValue must match/u);
  });
});
