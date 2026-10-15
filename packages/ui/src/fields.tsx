import type { ReactNode } from "react";
import { Box, MenuItem, TextField, Typography } from "@mui/material";
import type { FieldMetadata } from "@vnext/metadata";

export interface MetadataFieldProps {
  field: FieldMetadata;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
}

export function MetadataField({ field, value, onChange, error, disabled }: MetadataFieldProps) {
  const common = { fullWidth: true, size: "small" as const, label: field.label, helperText: error ?? field.description, error: Boolean(error), ...(disabled ? { disabled: true } : {}) };
  if (field.widget === "select") {
    return <TextField {...common} select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
      {(field.options ?? []).map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
    </TextField>;
  }
  if (field.widget === "checkbox") {
    return <TextField {...common} select value={String(Boolean(value))} onChange={(event) => onChange(event.target.value === "true")}>
      <MenuItem value="true">Yes</MenuItem><MenuItem value="false">No</MenuItem>
    </TextField>;
  }
  const type = field.widget === "currency" || field.widget === "percent" || field.widget === "number" ? "number" : field.widget === "date" ? "date" : "text";
  const inputProps = {
    ...(field.min !== undefined ? { min: field.min } : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
    ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
    ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
    ...(field.widget === "currency" ? { step: "0.01" } : field.widget === "percent" ? { step: "0.001" } : {}),
  };
  return <TextField {...common} type={type} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} slotProps={{ htmlInput: inputProps }} />;
}

export function FieldGrid({ children, columns = 2 }: { children: ReactNode; columns?: number }) {
  return <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: `repeat(${columns}, minmax(0, 1fr))` }, gap: 2.25 }}>{children}</Box>;
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return <Box sx={{ mb: 2 }}><Typography variant="h6">{title}</Typography>{description && <Typography variant="body2" color="text.secondary">{description}</Typography>}</Box>;
}
