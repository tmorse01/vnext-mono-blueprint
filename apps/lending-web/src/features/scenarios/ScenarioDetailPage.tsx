import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { Alert, Box, Breadcrumbs, Button, Card, CardContent, Chip, Divider, Link as MuiLink, Stack, Typography } from "@mui/material";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import { ConflictState, ErrorState, FieldGrid, LoadingState, MetadataField, SectionHeading } from "@vnext/ui";
import { evaluateCondition, metadataDocumentSchema, resolveMetadata } from "@vnext/metadata";
import type { FieldMetadata } from "@vnext/metadata";
import { getScenario, scenarioKeys } from "./api.js";
import type { ScenarioDetail } from "./model.js";
import { metadataByFamily } from "./metadata.js";
import { useScenarioAutosave } from "./useAutosave.js";
import { useCurrentUser } from "../../app/auth.js";

const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));

export function ScenarioDetailPage() {
  const { scenarioId = "" } = useParams();
  const scenarioQuery = useQuery({ queryKey: scenarioKeys.detail(scenarioId), queryFn: ({ signal }) => getScenario(scenarioId, signal), enabled: Boolean(scenarioId) });
  if (scenarioQuery.isLoading) return <LoadingState label="Loading scenario" />;
  if (scenarioQuery.isError || !scenarioQuery.data) return <ErrorState error={scenarioQuery.error ?? new Error("Scenario not found.")} retry={() => void scenarioQuery.refetch()} />;
  return <ScenarioEditor detail={scenarioQuery.data} />;
}

function ScenarioEditor({ detail }: { detail: ScenarioDetail }) {
  const fallback = metadataByFamily[detail.edit.productFamily];
  const document = useMemo(() => detail.metadataRevision?.document ? resolveMetadata({ fields: fallback.fields, layout: fallback.layout }, { fields: detail.metadataRevision.document.fields, layout: detail.metadataRevision.document.layout }) : metadataDocumentSchema.parse(fallback), [detail, fallback]);
  const form = useForm({ defaultValues: detail.edit, onSubmit: async () => undefined });
  const values = form.useStore((state) => state.values);
  const auto = useScenarioAutosave(detail, values);
  const currentUser = useCurrentUser();
  const canWrite = currentUser.data?.permissions.includes("scenarios.write") ?? false;
  const canReadAudit = currentUser.data?.permissions.includes("audit.read") ?? false;
  const family = detail.edit.productFamily;
  const knownKeys = new Set(["name", "loanAmount", "rate", "termMonths", "construction.projectType", "construction.constructionMonths", "dscr.monthlyRent", "dscr.monthlyExpenses"]);
  const ruleValues = { ...values, "construction.projectType": values.construction?.projectType, "construction.constructionMonths": values.construction?.constructionMonths, "dscr.monthlyRent": values.dscr?.monthlyRent, "dscr.monthlyExpenses": values.dscr?.monthlyExpenses };
  const fieldsByGroup = new Map<string, FieldMetadata[]>();
  for (const metadataField of document.fields) {
    if (!knownKeys.has(metadataField.key) || (metadataField.visibleWhen && !evaluateCondition(metadataField.visibleWhen, ruleValues))) continue;
    const group = metadataField.group ?? "Scenario details";
    fieldsByGroup.set(group, [...(fieldsByGroup.get(group) ?? []), metadataField]);
  }
  const renderField = (metadataField: FieldMetadata) => {
    switch (metadataField.key) {
      case "name": return <form.Field key={metadataField.key} name="name">{(control) => <MetadataField field={metadataField} value={control.state.value} disabled={!canWrite} onChange={(value) => control.handleChange(String(value))} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      case "loanAmount": return <form.Field key={metadataField.key} name="loanAmount">{(control) => <MetadataField field={metadataField} value={control.state.value} disabled={!canWrite} onChange={(value) => control.handleChange(String(value))} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      case "rate": return <form.Field key={metadataField.key} name="rate">{(control) => <MetadataField field={metadataField} value={detail.scenario.rate === null ? "" : control.state.value} disabled={!canWrite} onChange={(value) => control.handleChange(String(value))} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      case "termMonths": return <form.Field key={metadataField.key} name="termMonths">{(control) => <MetadataField field={metadataField} value={detail.scenario.termMonths === null ? "" : control.state.value} disabled={!canWrite} onChange={(value) => control.handleChange(value === "" ? 0 : Number(value))} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      case "construction.projectType": return <form.Field key={metadataField.key} name="construction.projectType">{(control) => <MetadataField field={metadataField} value={control.state.value ?? "ground_up"} disabled={!canWrite} onChange={(value) => control.handleChange(value === "renovation" ? "renovation" : "ground_up")} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      case "construction.constructionMonths": return <form.Field key={metadataField.key} name="construction.constructionMonths">{(control) => <MetadataField field={metadataField} value={control.state.value ?? 1} disabled={!canWrite} onChange={(value) => control.handleChange(value === "" ? 0 : Number(value))} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      case "dscr.monthlyRent": return <form.Field key={metadataField.key} name="dscr.monthlyRent">{(control) => <MetadataField field={metadataField} value={control.state.value ?? ""} disabled={!canWrite} onChange={(value) => control.handleChange(String(value))} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      case "dscr.monthlyExpenses": return <form.Field key={metadataField.key} name="dscr.monthlyExpenses">{(control) => <MetadataField field={metadataField} value={control.state.value ?? ""} disabled={!canWrite} onChange={(value) => control.handleChange(String(value))} error={control.state.meta.errors.join(", ")} />}</form.Field>;
      default: return null;
    }
  };
  const changedAt = dateLabel(detail.scenario.updatedAt);
  const reloadLatest = () => {
    if (window.confirm("Reload the latest saved scenario? Copy any unsaved edits before continuing.")) window.location.reload();
  };
  const status = auto.state === "saving" ? "Saving changes…" : auto.state === "unsaved" ? "Unsaved changes" : auto.state === "invalid" ? "Fix validation issues to save" : auto.state === "failed" ? "Save failed · your edits are still here" : auto.state === "conflict" ? "Conflict · your edits are still here" : "All changes saved";

  return <Stack spacing={2.5}>
    <Breadcrumbs aria-label="Breadcrumb"><MuiLink component={Link} underline="hover" color="inherit" to="/scenarios">Scenarios</MuiLink><Typography color="text.primary">{detail.scenario.name}</Typography></Breadcrumbs>
    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "flex-end" }} justifyContent="space-between" gap={2}>
      <Box><Button component={Link} to="/scenarios" size="small" startIcon={<ArrowBackRounded />} sx={{ mb: 1, pl: 0 }}>All scenarios</Button><Stack direction="row" spacing={1} alignItems="center"><Typography variant="h4">{detail.scenario.name}</Typography><Chip size="small" label={family === "construction" ? "Construction" : "DSCR"} color="primary" variant="outlined" /></Stack><Typography color="text.secondary" sx={{ mt: .5 }}>Scenario assumptions · Last updated {changedAt}</Typography></Box>
      <Stack direction="row" spacing={1}>{canReadAudit && <Button component={Link} to={`/scenarios/${detail.scenario.id}/audit`} startIcon={<HistoryRounded />} variant="outlined">Audit history</Button>}<Chip label={status} color={auto.state === "failed" || auto.state === "conflict" ? "warning" : auto.state === "saved" ? "success" : "default"} variant="outlined" sx={{ alignSelf: "center" }} /></Stack>
    </Stack>
    {auto.reloadConflict && <ConflictState onReload={reloadLatest} />}
    {auto.state === "invalid" && auto.error && <Alert severity="warning">{auto.error.message}. Your edits are still here and will save once the values are valid.</Alert>}
    {auto.state === "failed" && auto.error && <Alert severity="error" action={<Button color="inherit" onClick={auto.retry}>Retry save</Button>}>{auto.error.message}. The version check will protect changes already committed by the server.</Alert>}
    <Stack direction={{ xs: "column", lg: "row" }} spacing={2.5} alignItems="flex-start">
      <Stack spacing={2.5} sx={{ flex: 1, width: "100%", minWidth: 0 }}>
        {[...fieldsByGroup.entries()].map(([group, metadataFields]) => <Card key={group}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <SectionHeading title={group} {...(group === "Loan details" ? { description: "Shared assumptions across product families. Valid changes save automatically." } : {})} />
          <FieldGrid>{metadataFields.map(renderField)}</FieldGrid>
        </CardContent></Card>)}
        <Typography variant="caption" color="text.secondary">Metadata revision {detail.metadataRevision?.id ?? "default-v1"} · Product version {detail.productVersionId}</Typography>
      </Stack>
      <Card sx={{ width: { xs: "100%", lg: 310 }, flexShrink: 0 }}><CardContent><Typography variant="overline" color="text.secondary" fontWeight={700}>SCENARIO SNAPSHOT</Typography><Typography variant="h5" sx={{ mt: .5 }}>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(values.loanAmount))}</Typography><Typography variant="body2" color="text.secondary">Requested financing</Typography><Divider sx={{ my: 2 }} /><Stack spacing={1.3}><Stat label="Product family" value={family === "construction" ? "Construction" : "DSCR"} /><Stat label="Illustrative rate" value={values.rate === null ? "Unspecified" : `${values.rate}%`} /><Stat label="Term" value={values.termMonths === null ? "Unspecified" : `${values.termMonths} months`} /><Stat label="Record version" value={detail.scenario.version} /></Stack><Divider sx={{ my: 2 }} /><Alert severity="info" icon={false} sx={{ fontSize: 12 }}>Illustrative terms are examples only. Final pricing and eligibility require review.</Alert></CardContent></Card>
    </Stack>
  </Stack>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Stack direction="row" justifyContent="space-between" spacing={1}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={650}>{value}</Typography></Stack>;
}
