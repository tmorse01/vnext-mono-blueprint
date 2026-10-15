import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Card, CardContent, Chip, Divider, FormControl, IconButton, InputLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import PreviewRounded from "@mui/icons-material/PreviewRounded";
import PublishRounded from "@mui/icons-material/PublishRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import SaveRounded from "@mui/icons-material/SaveRounded";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import { ApiError } from "@vnext/api-client";
import { EmptyState, ErrorState, FieldGrid, LoadingState, MetadataField, SectionHeading } from "@vnext/ui";
import { evaluateCondition, metadataDocumentSchema, validateMetadataAgainstRegistry } from "@vnext/metadata";
import type { FieldMetadata, MetadataDocument, SafeCondition } from "@vnext/metadata";
import { defaultScope } from "./fixtures.js";
import type { MetadataScope } from "./model.js";
import { emptyDocument, knownFieldKeys } from "./model.js";
import { createRevertedDraft, getAudit, getCurrentUser, getDrafts, getRevisions, login, metadataKeys, previewDraft, publishDraft, saveDraft, validateDraft } from "./api.js";

const businessUnits = [
  { id: "00000000-0000-4000-8000-000000000001", label: "Demonstration Lending" },
];
const samples: Record<string, unknown> = { name: "Cedar Grove Apartments", loanAmount: "2850000", rate: "8.25", termMonths: 24, "construction.projectType": "ground_up", "construction.constructionMonths": 18, "dscr.monthlyRent": "23500", "dscr.monthlyExpenses": "6200" };
const knownFields: FieldMetadata[] = [
  { key: "termMonths", label: "Loan term (months)", description: "Requested term for the loan.", group: "Loan terms", order: 5, widget: "number", required: true, min: 1, max: 600 },
  { key: "dscr.monthlyRent", label: "Monthly rent", description: "Gross monthly rent across units.", group: "Property income", order: 6, widget: "currency", required: true, min: 0 },
  { key: "dscr.monthlyExpenses", label: "Monthly expenses", description: "Recurring property expenses.", group: "Property income", order: 7, widget: "currency", required: true, min: 0 },
];
const familyLabel = (family: string) => family === "construction" ? "Construction" : "DSCR";
const dateTime = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const conditionOperators = ["equals", "notEquals", "in", "greaterThan", "lessThan"] as const;
type EditableField = MetadataDocument["fields"][number];

export function MetadataWorkspace() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<MetadataScope>(defaultScope);
  const [document, setDocument] = useState<MetadataDocument | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "history">("editor");
  const [validation, setValidation] = useState<{ valid: boolean; issues: string[] } | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [localIssues, setLocalIssues] = useState<string[]>([]);
  const [previewResult, setPreviewResult] = useState<{ valid: boolean; issues: string[]; values: Record<string, unknown> } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const me = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => getCurrentUser(signal) });
  const drafts = useQuery({ queryKey: metadataKeys.drafts(scope), queryFn: ({ signal }) => getDrafts(scope, signal) });
  const revisions = useQuery({ queryKey: metadataKeys.revisions(scope), queryFn: ({ signal }) => getRevisions(scope, signal) });
  const currentDraft = drafts.data?.items[0];
  const scopedPublishedRevisionId = revisions.data?.items.find((revision) => revision.state === "published")?.id ?? null;
  const auditRevisionId = currentDraft?.id ?? drafts.data?.published?.id;
  const audit = useQuery({ queryKey: [...metadataKeys.audit(scope), auditRevisionId], queryFn: ({ signal }) => auditRevisionId ? getAudit(auditRevisionId, signal) : Promise.resolve({ items: [] }), enabled: me.data?.permissions.includes("audit.read") === true && Boolean(auditRevisionId) });
  const value = document ?? currentDraft?.document ?? drafts.data?.published?.document ?? emptyDocument();
  const apiEnvironment = drafts.data?.environment;
  useEffect(() => { if (apiEnvironment && apiEnvironment !== scope.environment) setScope((current) => ({ ...current, environment: apiEnvironment })); }, [apiEnvironment, scope.environment]);
  const dirty = Boolean(document && (!currentDraft || JSON.stringify(document) !== JSON.stringify(currentDraft.document)));
  const canEdit = me.data?.permissions.includes("metadata.edit") === true;
  const canPublish = me.data?.permissions.includes("metadata.publish") === true;
  const canAudit = me.data?.permissions.includes("audit.read") === true;
  const invalidLocal = useMemo(() => {
    const result = metadataDocumentSchema.safeParse(value);
    return result.success ? validateMetadataAgainstRegistry(result.data, knownFieldKeys) : result.error.issues.map((issue) => `${issue.path.join(".") || "Metadata"}: ${issue.message}`);
  }, [value]);

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: metadataKeys.all }); };
  const onConflict = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) setMessage({ kind: "warning", text: "This draft changed in another session. Your local edits are preserved; reload the latest version before saving again." });
    else setMessage({ kind: "error", text: error instanceof Error ? error.message : "The request could not be completed." });
  };
  const save = useMutation({
    mutationFn: () => {
      const parsed = metadataDocumentSchema.parse(value);
      return saveDraft(currentDraft?.id, { scope, expectedVersion: currentDraft?.version ?? "new", document: parsed });
    },
    onSuccess: async (result) => {
      setDocument(result.draft.document); setValidation(null); setLocalIssues([]);
      await queryClient.invalidateQueries({ queryKey: metadataKeys.drafts(scope) });
      setMessage({ kind: "success", text: "Draft saved with a new version." });
    }, onError: onConflict,
  });
  const validate = useMutation({
    mutationFn: async () => {
      const parsed = metadataDocumentSchema.parse(value);
      const registryIssues = validateMetadataAgainstRegistry(parsed, knownFieldKeys);
      const server = await validateDraft(scope, parsed);
      return { valid: server.valid && registryIssues.length === 0, issues: [...registryIssues, ...server.issues] };
    }, onSuccess: (result) => { setValidation(result); setMessage({ kind: result.valid ? "success" : "error", text: result.valid ? "Validation passed. This draft is ready to preview or publish." : "Validation found issues that must be resolved." }); }, onError: onConflict,
  });
  const preview = useMutation({
    mutationFn: async () => {
      if (dirty) {
        const parsed = metadataDocumentSchema.parse(value);
        const saved = await saveDraft(currentDraft?.id, { scope, expectedVersion: currentDraft?.version ?? "new", document: parsed });
        setDocument(saved.draft.document);
        await queryClient.invalidateQueries({ queryKey: metadataKeys.drafts(scope) });
        return previewDraft(saved.draft.id, samples);
      }
      if (!currentDraft) throw new Error("Create a draft before previewing it.");
      return previewDraft(currentDraft.id, samples);
    }, onSuccess: (result) => { setDocument(result.document); setPreviewResult({ valid: result.valid, issues: result.issues, values: result.values }); setActiveTab("preview"); setMessage({ kind: "success", text: `Preview is isolated to draft revision ${result.revisionId}.` }); }, onError: onConflict,
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (!currentDraft || !validation?.valid || dirty) throw new Error("Save and validate the current draft before publishing.");
      return publishDraft(currentDraft.id, currentDraft.version, scopedPublishedRevisionId);
    }, onSuccess: async () => { setMessage({ kind: "success", text: "Revision published. Existing revisions remain available for rollback." }); setValidation(null); setDocument(null); await queryClient.invalidateQueries({ queryKey: metadataKeys.all }); }, onError: onConflict,
  });
  const revert = useMutation({
    mutationFn: async (revisionId: string) => {
      return createRevertedDraft(scope, revisionId);
    }, onSuccess: async (result) => { setDocument(result.draft.document); setValidation(null); setMessage({ kind: "success", text: "Prior revision copied into a new draft. Review and publish it to make it active." }); await queryClient.invalidateQueries({ queryKey: metadataKeys.all }); setActiveTab("editor"); }, onError: onConflict,
  });

  const changeScope = (key: keyof MetadataScope, next: string | null) => {
    const updated = { ...scope, [key]: next } as MetadataScope;
    setScope(updated); setDocument(null); setValidation(null); setMessage(null);
  };
  const updateField = (index: number, update: Partial<EditableField>) => {
    if (!value) return;
    const fields = value.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...update } : field);
    setDocument({ ...value, fields }); setValidation(null); setLocalIssues([]); setMessage(null);
  };
  const addField = (key: string) => {
    if (!value || !key) return;
    const field = knownFields.find((item) => item.key === key);
    if (!field || value.fields.some((item) => item.key === key)) return;
    setDocument({ ...value, fields: [...value.fields, { ...field, order: value.fields.length }] }); setValidation(null); setLocalIssues([]);
  };
  const removeField = (key: string) => { if (value) { setDocument({ ...value, fields: value.fields.filter((field) => field.key !== key) }); setValidation(null); setLocalIssues([]); } };
  const exportDocument = () => {
    const payload = JSON.stringify({ format: "vnext-metadata", formatVersion: 1, productFamily: scope.productFamily, document: value }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = window.document.createElement("a"); link.href = url; link.download = `metadata-${scope.productFamily}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const importDocument = async (file?: File) => {
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (!raw || typeof raw !== "object" || !("document" in raw)) throw new Error("Choose a vNext metadata JSON export.");
      const envelope = raw as { format?: unknown; formatVersion?: unknown; productFamily?: unknown; document: unknown };
      if (envelope.format !== "vnext-metadata" || envelope.formatVersion !== 1) throw new Error("This metadata export format is unsupported.");
      const parsed = metadataDocumentSchema.parse(envelope.document);
      const registryIssues = validateMetadataAgainstRegistry(parsed, knownFieldKeys);
      const server = await validateDraft(scope, parsed);
      const familyIssues = envelope.productFamily !== scope.productFamily ? [`This export targets ${String(envelope.productFamily)}; re-import it under the matching product family.`] : [];
      const issues = [...registryIssues, ...server.issues, ...familyIssues];
      setDocument(parsed); setValidation({ valid: server.valid && issues.length === 0, issues }); setLocalIssues(issues);
      setMessage({ kind: issues.length ? "warning" : "success", text: issues.length ? `Imported as an unsaved draft with ${issues.length} compatibility issue(s). Resolve them before saving.` : "Imported and revalidated for this target scope. Review, then save as a draft." });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not import this metadata file." }); }
    finally { if (importInput.current) importInput.current.value = ""; }
  };

  if (me.isLoading || drafts.isLoading) return <LoadingState label="Loading metadata configuration" />;
  if (me.isError && me.error instanceof ApiError && me.error.status === 401) return <LoginPanel onAuthenticated={() => { void queryClient.invalidateQueries({ queryKey: ["current-user"] }); void queryClient.invalidateQueries({ queryKey: metadataKeys.all }); }} />;
  if (me.isError) return <ErrorState error={me.error} retry={() => void me.refetch()} />;
  if (drafts.isError) return <ErrorState error={drafts.error} retry={() => void drafts.refetch()} />;
  return <Stack spacing={3}>
    <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "flex-end" }} gap={2}>
      <Box><Typography variant="overline" color="primary.main" fontWeight={800} letterSpacing=".14em">PRODUCT CONFIGURATION</Typography><Typography variant="h4" sx={{ mt: .5 }}>Metadata studio</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>Shape supported form fields, preview the draft safely, then publish a versioned configuration.</Typography></Box>
      <Stack direction="row" spacing={1} flexWrap="wrap"><Button startIcon={<RefreshRounded />} onClick={() => { setDocument(null); setValidation(null); setMessage(null); refresh(); }} disabled={!currentDraft && !drafts.data?.published}>Reload</Button><Button variant="outlined" onClick={exportDocument}>Export JSON</Button><Button variant="outlined" onClick={() => importInput.current?.click()} disabled={!canEdit}>Import to target draft</Button><input ref={importInput} type="file" accept="application/json,.json" hidden aria-label="Import metadata JSON" onChange={(event) => void importDocument(event.target.files?.[0])} /><Button variant="outlined" startIcon={<SaveRounded />} onClick={() => save.mutate()} disabled={!canEdit || !dirty || save.isPending || invalidLocal.length > 0 || localIssues.length > 0}>Save draft</Button><Button variant="contained" startIcon={<PublishRounded />} onClick={() => publish.mutate()} disabled={!canPublish || !currentDraft || dirty || !validation?.valid || publish.isPending} title={!canPublish ? "Requires metadata.publish" : undefined}>Publish revision</Button></Stack>
    </Stack>
    <Card><CardContent><Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
      <FormControl size="small" sx={{ minWidth: 155 }}><InputLabel id="environment-label">Environment</InputLabel><Select labelId="environment-label" label="Environment" value={drafts.data?.environment ?? scope.environment} disabled><MenuItem value="local">Local</MenuItem><MenuItem value="preview">Preview</MenuItem><MenuItem value="production">Production</MenuItem></Select></FormControl>
      <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel id="family-label">Product family</InputLabel><Select labelId="family-label" label="Product family" value={scope.productFamily} onChange={(event) => changeScope("productFamily", event.target.value)}><MenuItem value="construction">Construction</MenuItem><MenuItem value="dscr">DSCR</MenuItem></Select></FormControl>
      <FormControl size="small" sx={{ minWidth: 210 }}><InputLabel id="bu-label">Business unit</InputLabel><Select labelId="bu-label" label="Business unit" value={scope.businessUnitId ?? "platform"} onChange={(event) => changeScope("businessUnitId", event.target.value === "platform" ? null : event.target.value)}><MenuItem value="platform">Platform defaults</MenuItem>{businessUnits.map((unit) => <MenuItem key={unit.id} value={unit.id}>{unit.label}</MenuItem>)}</Select></FormControl>
      <Box sx={{ flex: 1 }} /><Chip size="small" color={currentDraft ? "warning" : drafts.data?.published ? "success" : "default"} variant="outlined" label={currentDraft ? "Draft" : drafts.data?.published ? "Published · no draft" : "No revision"} /><Typography variant="body2" color="text.secondary">{currentDraft ? `Revision ${currentDraft.revisionNumber} · ${currentDraft.version}` : drafts.data?.published ? `Active revision ${drafts.data.published.revisionNumber}` : "No revision exists for this scope"}</Typography>
    </Stack></CardContent></Card>
    {!canEdit && <Alert severity="info">You have read-only access to this scope. Draft editing, validation, preview and revert actions require <strong>metadata.edit</strong>.</Alert>}
    {message && <Alert severity={message.kind} onClose={() => setMessage(null)}>{message.text}</Alert>}
    <Card>
      <Tabs value={activeTab} onChange={(_, value: "editor" | "preview" | "history") => setActiveTab(value)} sx={{ px: 2, borderBottom: "1px solid #e8ece9" }}>
        <Tab value="editor" label="Draft editor" />
        <Tab value="preview" icon={<PreviewRounded fontSize="small" />} iconPosition="start" label="Preview" />
        <Tab value="history" icon={<HistoryRounded fontSize="small" />} iconPosition="start" label="History & audit" />
      </Tabs>
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        {activeTab === "editor" && <Stack spacing={3}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}><Box><SectionHeading title={`${familyLabel(scope.productFamily)} fields`} description="Stable field keys and database mappings are code-owned. This editor only changes supported presentation and validation settings." /><Stack direction="row" spacing={1.5}><FormControl size="small" sx={{ minWidth: 210 }}><InputLabel id="navigation-label">Navigation layout</InputLabel><Select labelId="navigation-label" label="Navigation layout" value={value.layout.navigation ?? "standard"} disabled={!canEdit} onChange={(event) => setDocument({ ...value, layout: { ...value.layout, navigation: event.target.value as "standard" | "compact" } })}><MenuItem value="standard">Standard</MenuItem><MenuItem value="compact">Compact</MenuItem></Select></FormControl><FormControl size="small" sx={{ minWidth: 150 }}><InputLabel id="columns-label">Form columns</InputLabel><Select labelId="columns-label" label="Form columns" value={value.layout.columns ?? 2} disabled={!canEdit} onChange={(event) => setDocument({ ...value, layout: { ...value.layout, columns: Number(event.target.value) as 1 | 2 | 3 } })}><MenuItem value={1}>1 column</MenuItem><MenuItem value={2}>2 columns</MenuItem><MenuItem value={3}>3 columns</MenuItem></Select></FormControl></Stack></Box><FormControl size="small" sx={{ minWidth: 210 }}><InputLabel id="add-field-label">Add supported field</InputLabel><Select labelId="add-field-label" label="Add supported field" value="" disabled={!canEdit} onChange={(event) => addField(event.target.value)}><MenuItem value="" disabled>Choose a field</MenuItem>{knownFields.filter((field) => !field.key.includes(".") || field.key.startsWith(`${scope.productFamily}.`)).filter((field) => !value.fields.some((item) => item.key === field.key)).map((field) => <MenuItem value={field.key} key={field.key}>{field.label} · {field.key}</MenuItem>)}</Select></FormControl></Stack>
          {value.fields.length === 0 ? <EmptyState title="No fields configured" detail="Add a known field from the registry to compose this form." /> : <Stack spacing={2}>{value.fields.map((field, index) => <FieldEditor key={field.key} field={field} disabled={!canEdit} onChange={(update) => updateField(index, update)} onRemove={() => removeField(field.key)} />)}</Stack>}
          <Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" fontWeight={700}>Configuration checks</Typography><Chip size="small" color={invalidLocal.length === 0 ? "success" : "error"} label={invalidLocal.length === 0 ? "Schema and registry valid" : `${invalidLocal.length} issue${invalidLocal.length === 1 ? "" : "s"}`} /></Stack>
          {invalidLocal.length > 0 && <Alert severity="error"><ul className="issues">{invalidLocal.map((issue) => <li key={issue}>{issue}</li>)}</ul></Alert>}
          {localIssues.length > 0 && <Alert severity="error">{localIssues.join("; ")}</Alert>}
          {validation && <Alert severity={validation.valid ? "success" : "error"}>{validation.valid ? "Server validation passed." : validation.issues.join("; ")}</Alert>}
          <Divider />
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1}><Typography variant="body2" color="text.secondary">{dirty ? "Unsaved edits" : currentDraft ? "All changes are saved" : "New draft not saved"}{validation?.valid ? " · validated" : ""}</Typography><Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<CheckCircleRounded />} onClick={() => { const issues = invalidLocal; setLocalIssues(issues); if (issues.length) { setMessage({ kind: "error", text: "Fix schema or registry issues before server validation." }); return; } validate.mutate(); }} disabled={!canEdit || invalidLocal.length > 0 || validate.isPending}>Validate draft</Button><Button variant="contained" startIcon={<PreviewRounded />} onClick={() => preview.mutate()} disabled={!canEdit || invalidLocal.length > 0 || preview.isPending}>Preview draft</Button></Stack></Stack>
        </Stack>}
        {activeTab === "preview" && <PreviewPane document={value} scope={scope} revision={currentDraft?.version ?? "unsaved"} result={previewResult} />}
        {activeTab === "history" && <Stack spacing={3}>
          <Box><SectionHeading title="Published revisions" description="Reverting creates a new draft from prior content. It does not rewrite history or immediately switch the active configuration." />
            {revisions.isLoading ? <LoadingState label="Loading revision history" /> : revisions.isError ? <ErrorState error={revisions.error} retry={() => void revisions.refetch()} /> : revisions.data?.items.length ? <Stack divider={<Divider flexItem />}>
              {revisions.data.items.filter((revision) => revision.state !== "draft").map((revision) => <Stack key={revision.id} direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} sx={{ py: 1.5 }}><Box sx={{ flex: 1 }}><Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={700}>Revision {revision.revisionNumber}</Typography><Chip size="small" color={revision.state === "published" ? "success" : "default"} label={revision.state} /></Stack><Typography variant="body2" color="text.secondary">Published {dateTime(revision.publishedAt ?? revision.createdAt)} · {revision.id}</Typography></Box><Tooltip title={!canEdit ? "Requires metadata.edit" : "Copy prior content into a new draft"}><span><Button size="small" variant="outlined" disabled={!canEdit || revert.isPending} onClick={() => revert.mutate(revision.id)}>Revert to this</Button></span></Tooltip></Stack>)}
            </Stack> : <EmptyState title="No published revisions" detail="Published configuration versions will appear here." />}</Box>
          <Divider />
          <Box><SectionHeading title="Audit trail" description="Versioned configuration actions are retained with the actor and event time." />{!canAudit ? <Alert severity="info">Audit history requires <strong>audit.read</strong>.</Alert> : audit.isLoading ? <LoadingState label="Loading audit events" /> : audit.isError ? <ErrorState error={audit.error} retry={() => void audit.refetch()} /> : <Stack divider={<Divider flexItem />}>{(audit.data?.items ?? []).map((entry) => <Stack key={entry.id} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ py: 1.25 }}><Typography variant="body2" color="text.secondary" sx={{ minWidth: 175 }}>{dateTime(entry.occurredAt)}</Typography><Box sx={{ flex: 1 }}><Typography fontWeight={700}>{entry.action}</Typography><Typography variant="body2" color="text.secondary">{entry.detail}</Typography></Box><Typography variant="body2">{entry.actorDisplayName}{entry.revisionNumber !== undefined ? ` · rev ${entry.revisionNumber}` : ""}</Typography></Stack>)}</Stack>}</Box>
        </Stack>}
      </CardContent>
    </Card>
    <Typography variant="caption" color="text.secondary">Changes apply only to this selected environment, product family, and business unit. Preview never changes the published configuration.</Typography>
  </Stack>;
}

function LoginPanel({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState(import.meta.env.VITE_LOCAL_USER_EMAIL ?? "");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const signIn = useMutation({ mutationFn: () => login(email.trim(), password), onSuccess: onAuthenticated, onError: (error) => setErrorText(error instanceof Error ? error.message : "Sign-in failed.") });
  return <Box sx={{ maxWidth: 440, mx: "auto", py: { xs: 3, md: 8 } }}><Card><CardContent sx={{ p: 4 }}><Stack spacing={2.5} component="form" onSubmit={(event) => { event.preventDefault(); setErrorText(""); signIn.mutate(); }}>
    <Box><Typography variant="overline" color="primary.main" fontWeight={800}>NORTHSTAR CAPITAL</Typography><Typography variant="h5" sx={{ mt: .5 }}>Sign in to Configuration Studio</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>Use your assigned account. Access is checked by the server.</Typography></Box>
    {errorText && <Alert severity="error">{errorText}</Alert>}
    <TextField label="Email address" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
    <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
    <Button type="submit" variant="contained" disabled={signIn.isPending || !email.trim() || !password}>{signIn.isPending ? "Signing in…" : "Sign in"}</Button>
  </Stack></CardContent></Card></Box>;
}

function FieldEditor({ field, disabled, onChange, onRemove }: { field: EditableField; disabled: boolean; onChange: (update: Partial<EditableField>) => void; onRemove: () => void }) {
  const condition = field.visibleWhen;
  const changeCondition = (update: Partial<SafeCondition>) => {
    const operator = (update.operator ?? condition?.operator ?? "equals") as SafeCondition["operator"];
    const fieldKey = (update.field ?? condition?.field ?? "scenario.name") as string;
    const prior = condition?.value;
    const candidate = update.value ?? prior;
    if (operator === "in") onChange({ visibleWhen: { operator: "in", field: fieldKey, value: Array.isArray(candidate) ? candidate : [] } });
    else if (operator === "greaterThan") onChange({ visibleWhen: { operator: "greaterThan", field: fieldKey, value: typeof candidate === "number" ? candidate : Number(candidate ?? 0) } });
    else if (operator === "lessThan") onChange({ visibleWhen: { operator: "lessThan", field: fieldKey, value: typeof candidate === "number" ? candidate : Number(candidate ?? 0) } });
    else if (operator === "equals") onChange({ visibleWhen: { operator: "equals", field: fieldKey, value: typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean" ? candidate : "" } });
    else onChange({ visibleWhen: { operator: "notEquals", field: fieldKey, value: typeof candidate === "string" || typeof candidate === "number" || typeof candidate === "boolean" ? candidate : "" } });
  };
  return <Card variant="outlined" sx={{ boxShadow: "none" }}><CardContent><Stack spacing={2}>
    <Stack direction="row" alignItems="center" spacing={1}><Box sx={{ flex: 1 }}><Typography fontWeight={750}>{field.label}</Typography><Typography variant="caption" color="text.secondary">{field.key} · {field.widget}{field.required ? " · required" : ""}</Typography></Box><Tooltip title={disabled ? "Requires metadata.edit" : "Remove field from draft"}><span><IconButton size="small" aria-label={`Remove ${field.label}`} onClick={onRemove} disabled={disabled}><DeleteOutlineRounded fontSize="small" /></IconButton></span></Tooltip></Stack>
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
      <TextField size="small" label="Label" value={field.label} onChange={(event) => onChange({ label: event.target.value })} disabled={disabled} inputProps={{ maxLength: 100 }} />
      <TextField size="small" label="Group" value={field.group ?? ""} onChange={(event) => onChange({ group: event.target.value })} disabled={disabled} inputProps={{ maxLength: 80 }} />
      <TextField size="small" label="Order" type="number" value={field.order} onChange={(event) => onChange({ order: Number(event.target.value) })} disabled={disabled} inputProps={{ min: 0, max: 10000 }} />
      <TextField size="small" label="Description" value={field.description ?? ""} onChange={(event) => onChange({ description: event.target.value || undefined })} disabled={disabled} inputProps={{ maxLength: 500 }} sx={{ gridColumn: { md: "span 2" } }} />
      <FormControl size="small"><InputLabel id={`widget-${field.key}`}>Widget</InputLabel><Select labelId={`widget-${field.key}`} label="Widget" value={field.widget} onChange={(event) => onChange({ widget: event.target.value as FieldMetadata["widget"] })} disabled={disabled}>{["text", "currency", "percent", "number", "date", "select", "checkbox"].map((widget) => <MenuItem key={widget} value={widget}>{widget}</MenuItem>)}</Select></FormControl>
      <TextField size="small" label="Minimum" type="number" value={field.min ?? ""} onChange={(event) => onChange({ min: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={disabled} />
      <TextField size="small" label="Maximum" type="number" value={field.max ?? ""} onChange={(event) => onChange({ max: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={disabled} />
      <TextField size="small" label="Min length" type="number" value={field.minLength ?? ""} onChange={(event) => onChange({ minLength: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={disabled} />
      <TextField size="small" label="Max length" type="number" value={field.maxLength ?? ""} onChange={(event) => onChange({ maxLength: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={disabled} />
      <FormControl size="small"><InputLabel id={`required-${field.key}`}>Required</InputLabel><Select labelId={`required-${field.key}`} label="Required" value={String(field.required ?? false)} onChange={(event) => onChange({ required: event.target.value === "true" })} disabled={disabled}><MenuItem value="true">Required</MenuItem><MenuItem value="false">Optional</MenuItem></Select></FormControl>
      <FormControl size="small"><InputLabel id={`column-${field.key}`}>Table column</InputLabel><Select labelId={`column-${field.key}`} label="Table column" value={String(field.tableColumn ?? false)} onChange={(event) => onChange({ tableColumn: event.target.value === "true" })} disabled={disabled}><MenuItem value="true">Shown in table</MenuItem><MenuItem value="false">Hidden from table</MenuItem></Select></FormControl>
      <FormControl size="small"><InputLabel id={`filter-${field.key}`}>Filter option</InputLabel><Select labelId={`filter-${field.key}`} label="Filter option" value={String(field.filterable ?? false)} onChange={(event) => onChange({ filterable: event.target.value === "true" })} disabled={disabled}><MenuItem value="true">Filterable</MenuItem><MenuItem value="false">Not filterable</MenuItem></Select></FormControl>
      {field.widget === "checkbox" ? <FormControl size="small"><InputLabel id={`default-${field.key}`}>Default</InputLabel><Select labelId={`default-${field.key}`} label="Default" value={field.defaultValue === undefined ? "none" : String(field.defaultValue)} onChange={(event) => onChange({ defaultValue: event.target.value === "none" ? undefined : event.target.value === "true" })} disabled={disabled}><MenuItem value="none">No default</MenuItem><MenuItem value="true">Yes</MenuItem><MenuItem value="false">No</MenuItem></Select></FormControl> : <TextField size="small" label="Default value" value={String(field.defaultValue ?? "")} onChange={(event) => onChange({ defaultValue: event.target.value === "" ? undefined : field.widget === "number" ? Number(event.target.value) : event.target.value })} disabled={disabled} helperText="Defaults are validated against this widget and its options." />}
    </Box>
    {field.widget === "select" && <TextField size="small" multiline minRows={2} label="Select options · one value | label per line" value={(field.options ?? []).map((option) => `${option.value} | ${option.label}`).join("\n")} onChange={(event) => onChange({ options: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [value = "", ...labelParts] = line.split("|"); const optionValue = value.trim(); return { value: optionValue, label: labelParts.join("|").trim() || optionValue }; }) })} disabled={disabled} helperText="These are display choices only; accepted values remain checked by the server." />}
    <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
      <FormControl size="small" sx={{ minWidth: 180 }}><InputLabel id={`visibility-${field.key}`}>Visibility</InputLabel><Select labelId={`visibility-${field.key}`} label="Visibility" value={condition ? "conditional" : "always"} disabled={disabled} onChange={(event) => onChange({ visibleWhen: event.target.value === "always" ? undefined : { operator: "equals", field: "scenario.name", value: "" } })}><MenuItem value="always">Always visible</MenuItem><MenuItem value="conditional">Conditional</MenuItem></Select></FormControl>
      {condition && <><FormControl size="small" sx={{ minWidth: 225 }}><InputLabel id={`condition-field-${field.key}`}>Depends on field</InputLabel><Select labelId={`condition-field-${field.key}`} label="Depends on field" value={condition.field} onChange={(event) => changeCondition({ field: event.target.value })} disabled={disabled}>{[...knownFieldKeys].map((key) => <MenuItem key={key} value={key}>{key}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 150 }}><InputLabel id={`condition-op-${field.key}`}>Rule</InputLabel><Select labelId={`condition-op-${field.key}`} label="Rule" value={condition.operator} onChange={(event) => changeCondition({ operator: event.target.value as SafeCondition["operator"] })} disabled={disabled}>{conditionOperators.map((operator) => <MenuItem key={operator} value={operator}>{operator}</MenuItem>)}</Select></FormControl><TextField size="small" label={condition.operator === "in" ? "Values · comma separated" : "Match value"} value={Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value)} onChange={(event) => { const raw = event.target.value; const newValue = condition.operator === "in" ? raw.split(",").map((item) => item.trim()).filter(Boolean) : condition.operator === "greaterThan" || condition.operator === "lessThan" ? Number(raw) : raw; changeCondition({ value: newValue }); }} disabled={disabled} /></>}
    </Stack>
  </Stack></CardContent></Card>;
}

function PreviewPane({ document, scope, revision, result }: { document: MetadataDocument; scope: MetadataScope; revision: string; result: { valid: boolean; issues: string[]; values: Record<string, unknown> } | null }) {
  const [localValues, setLocalValues] = useState<Record<string, unknown>>(samples);
  const values = result?.values ?? localValues;
  return <Stack spacing={3}>
    <Alert severity="info">Isolated draft preview · {scope.environment} · {familyLabel(scope.productFamily)} · {businessUnits.find((unit) => unit.id === scope.businessUnitId)?.label ?? "Business unit"} · {revision}</Alert>
    {result && <Alert severity={result.valid ? "success" : "warning"}>{result.valid ? "Preview data passed server validation." : result.issues.join("; ")}</Alert>}
    <Box><SectionHeading title="Scenario form preview" description="Rendered through the shared field adapter. Preview values are synthetic and do not change a scenario." /><Card variant="outlined" sx={{ boxShadow: "none" }}><CardContent><FieldGrid columns={document.layout.columns ?? 2}>{document.fields.filter((field) => !field.visibleWhen || evaluateCondition(field.visibleWhen, values)).map((field) => <MetadataField key={field.key} field={field} value={values[field.key]} onChange={(next) => setLocalValues((current) => ({ ...current, [field.key]: next }))} disabled={false} />)}</FieldGrid></CardContent></Card></Box>
  </Stack>;
}
