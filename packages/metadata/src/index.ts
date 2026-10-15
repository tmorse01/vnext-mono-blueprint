import { z } from "zod";

export const safeConditionSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("equals"), field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ operator: z.literal("notEquals"), field: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ operator: z.literal("in"), field: z.string(), value: z.array(z.union([z.string(), z.number(), z.boolean()])).max(50) }),
  z.object({ operator: z.literal("greaterThan"), field: z.string(), value: z.number() }),
  z.object({ operator: z.literal("lessThan"), field: z.string(), value: z.number() }),
]);

export const fieldMetadataSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9.]*$/),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  group: z.string().max(80).optional(),
  order: z.number().int().min(0).max(10_000),
  widget: z.enum(["text", "currency", "percent", "number", "date", "select", "checkbox"]),
  required: z.boolean().default(false),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).max(100).optional(),
  defaultValue: z.union([z.string().max(500), z.number(), z.boolean()]).optional(),
  visibleWhen: safeConditionSchema.optional(),
  tableColumn: z.boolean().default(false),
  filterable: z.boolean().default(false),
}).check((ctx) => {
  const field = ctx.value;
  if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
    ctx.issues.push({ code: "custom", message: "min must not exceed max", path: ["min"] });
  }
  if (field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength) {
    ctx.issues.push({ code: "custom", message: "minLength must not exceed maxLength", path: ["minLength"] });
  }
  if (field.defaultValue !== undefined) {
    const validDefault = field.widget === "checkbox"
      ? typeof field.defaultValue === "boolean"
      : field.widget === "number"
        ? typeof field.defaultValue === "number"
        : field.widget === "select"
          ? typeof field.defaultValue === "string" && (field.options ?? []).some((option) => option.value === field.defaultValue)
          : typeof field.defaultValue === "string";
    if (!validDefault) ctx.issues.push({ code: "custom", message: "defaultValue must match the widget and its supported options", path: ["defaultValue"] });
  }
});

export const metadataDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  fields: z.array(fieldMetadataSchema).max(500),
  layout: z.object({ navigation: z.enum(["standard", "compact"]).optional(), columns: z.number().int().min(1).max(3).optional() }).default({}),
});

export type SafeCondition = z.infer<typeof safeConditionSchema>;
export type FieldMetadata = z.input<typeof fieldMetadataSchema>;
export type MetadataDocument = z.infer<typeof metadataDocumentSchema>;

export interface MetadataLayer {
  fields?: readonly FieldMetadata[];
  layout?: MetadataDocument["layout"];
}

export function resolveMetadata(...layers: readonly MetadataLayer[]): MetadataDocument {
  const fields = new Map<string, FieldMetadata>();
  let layout: MetadataDocument["layout"] = {};
  for (const layer of layers) {
    for (const field of layer.fields ?? []) {
      const prior = fields.get(field.key);
      fields.set(field.key, prior ? { ...prior, ...field } : field);
    }
    layout = { ...layout, ...layer.layout };
  }
  return metadataDocumentSchema.parse({ schemaVersion: 1, fields: [...fields.values()].sort((a, b) => a.order - b.order), layout });
}

export function evaluateCondition(condition: SafeCondition, values: Readonly<Record<string, unknown>>): boolean {
  const actual = values[condition.field];
  switch (condition.operator) {
    case "equals": return actual === condition.value;
    case "notEquals": return actual !== condition.value;
    case "in": return condition.value.some((candidate) => candidate === actual);
    case "greaterThan": return typeof actual === "number" && actual > condition.value;
    case "lessThan": return typeof actual === "number" && actual < condition.value;
  }
}

export function validateMetadataAgainstRegistry(document: MetadataDocument, knownKeys: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const field of document.fields) {
    if (!knownKeys.has(field.key)) issues.push(`Unknown field key: ${field.key}`);
    if (seen.has(field.key)) issues.push(`Duplicate field key: ${field.key}`);
    seen.add(field.key);
    if (field.visibleWhen && !knownKeys.has(field.visibleWhen.field)) {
      issues.push(`Unknown visibility condition field: ${field.visibleWhen.field}`);
    }
    if (field.options) {
      const optionValues = new Set<string>();
      for (const option of field.options) {
        if (optionValues.has(option.value)) issues.push(`Duplicate option value for ${field.key}: ${option.value}`);
        optionValues.add(option.value);
      }
    }
    if (field.widget === "select" && !field.options?.length) {
      issues.push(`Select field ${field.key} must declare at least one option.`);
    }
  }
  return issues;
}
