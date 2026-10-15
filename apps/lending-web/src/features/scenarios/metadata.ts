import { metadataDocumentSchema, resolveMetadata } from "@vnext/metadata";
import type { FieldMetadata, MetadataDocument } from "@vnext/metadata";

const platformFields: FieldMetadata[] = [
  { key: "name", label: "Scenario name", description: "A recognizable name for this proposal.", group: "Loan details", order: 1, widget: "text", required: true, minLength: 2, maxLength: 120, tableColumn: false },
  { key: "loanAmount", label: "Requested loan amount", description: "Enter whole dollars or cents.", group: "Loan details", order: 2, widget: "currency", required: true, min: 1, tableColumn: true },
  { key: "rate", label: "Illustrative interest rate", description: "Annual rate shown as a percent.", group: "Loan details", order: 3, widget: "percent", required: true, min: 0, max: 100, tableColumn: false },
  { key: "termMonths", label: "Term", description: "Loan term in months.", group: "Loan details", order: 4, widget: "number", required: true, min: 1, max: 600, tableColumn: false },
];

const constructionFields: FieldMetadata[] = [
  { key: "construction.projectType", label: "Project type", description: "Select the primary construction scope.", group: "Construction plan", order: 10, widget: "select", required: true, options: [{ value: "ground_up", label: "Ground-up construction" }, { value: "renovation", label: "Renovation" }], tableColumn: false },
  { key: "construction.constructionMonths", label: "Construction period", description: "Planned duration before stabilization.", group: "Construction plan", order: 11, widget: "number", required: true, min: 1, max: 60, tableColumn: false },
];

const dscrFields: FieldMetadata[] = [
  { key: "dscr.monthlyRent", label: "Monthly gross rent", description: "Current or underwritten monthly rent.", group: "Property cash flow", order: 10, widget: "currency", required: true, min: 0, tableColumn: false },
  { key: "dscr.monthlyExpenses", label: "Monthly operating expenses", description: "Taxes, insurance, maintenance, and management.", group: "Property cash flow", order: 11, widget: "currency", required: true, min: 0, tableColumn: false },
];

export const metadataByFamily: Record<"construction" | "dscr", MetadataDocument> = {
  construction: resolveMetadata({ fields: platformFields }, { fields: constructionFields }),
  dscr: resolveMetadata({ fields: platformFields }, { fields: dscrFields }),
};

// Parse at module load so unsupported metadata cannot silently reach a field renderer.
for (const document of Object.values(metadataByFamily)) metadataDocumentSchema.parse(document);
