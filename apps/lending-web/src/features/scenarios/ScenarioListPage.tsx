import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataGrid } from "@mui/x-data-grid";
import type { GridColDef, GridPaginationModel, GridRowModel } from "@mui/x-data-grid";
import { Alert, Box, Button, Card, Chip, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import BookmarkBorderRounded from "@mui/icons-material/BookmarkBorderRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import { ApiError } from "@vnext/api-client";
import { LoadingState, EmptyState, ErrorState } from "@vnext/ui";
import type { ScenarioSummaryDto } from "@vnext/contracts";
import { getScenario, getScenarios, saveScenario, scenarioKeys } from "./api.js";
import type { ScenarioListParams } from "./model.js";
import { useCurrentUser } from "../../app/auth.js";

type SavedView = { label: string; q: string; status: string; family: string };
const SAVED_VIEWS_KEY = "vnext.lending.scenarioViews.v1";
const statuses = ["draft", "submitted", "approved", "declined"] as const;
const families = ["construction", "dscr"] as const;

function readViews(): SavedView[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SAVED_VIEWS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is SavedView => Boolean(item && typeof item.label === "string" && typeof item.q === "string" && typeof item.status === "string" && typeof item.family === "string")) : [];
  } catch { return []; }
}

const amount = (value: string | number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
const statusColor: Record<string, "default" | "info" | "success" | "error"> = { draft: "default", submitted: "info", approved: "success", declined: "error" };

export function ScenarioListPage() {
  const currentUser = useCurrentUser();
  const canWrite = currentUser.data?.permissions.includes("scenarios.write") ?? false;
  const [search, setSearch] = useSearchParams();
  const queryClient = useQueryClient();
  const [savedViews, setSavedViews] = useState(readViews);
  const [viewLabel, setViewLabel] = useState("");
  const [gridError, setGridError] = useState<string | null>(null);
  const q = search.get("q")?.slice(0, 120) ?? "";
  const status = statuses.find((value) => value === search.get("status")) ?? "";
  const family = families.find((value) => value === search.get("family")) ?? "";
  const sort = search.get("sort") ?? "updatedAt";
  const direction = search.get("direction") === "asc" ? "asc" : "desc";
  const stack = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(search.get("cursorStack") ?? "[]");
      return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed as string[] : [];
    } catch { return []; }
  }, [search]);
  const params: ScenarioListParams = { limit: 25, sort, direction, ...(q && { q }), ...(status && { status }), ...(family && { family }), ...(stack.at(-1) && { cursor: stack.at(-1) }) };
  const scenarios = useQuery({ queryKey: scenarioKeys.list(params), queryFn: ({ signal }) => getScenarios(params, signal) });
  const editAmount = useMutation({
    mutationFn: async (row: GridRowModel) => {
      const detail = await getScenario(String(row.id));
      const payload = { ...detail.edit, loanAmount: String(row.loanAmount), expectedVersion: detail.scenario.version, metadataRevision: detail.metadataRevision?.id ?? "default-v1" };
      const saved = await saveScenario(String(row.id), payload);
      return { ...row, ...saved };
    },
    onSuccess: async () => { setGridError(null); await queryClient.invalidateQueries({ queryKey: scenarioKeys.all }); },
    onError: (error) => setGridError(error instanceof ApiError && error.status === 409 ? "This scenario changed elsewhere. Open it to review the latest version before editing again." : error instanceof Error ? error.message : "Could not save the edited amount."),
    retry: false,
  });

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("cursorStack");
    setSearch(next);
  };
  const columns = useMemo<GridColDef<ScenarioSummaryDto>[]>(() => [
    { field: "name", headerName: "Scenario", flex: 1.45, minWidth: 250, renderCell: ({ row }) => <Box sx={{ py: 1 }}><Typography component={Link} to={`/scenarios/${row.id}`} fontWeight={700} sx={{ color: "text.primary", "&:hover": { color: "primary.main" } }}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.productFamily === "construction" ? "Construction" : "DSCR"} · {row.id.slice(0, 8)}</Typography></Box> },
    { field: "status", headerName: "Status", width: 130, renderCell: ({ value }) => <Chip size="small" label={String(value).replace(/^./, (letter) => letter.toUpperCase())} color={statusColor[String(value)] ?? "default"} variant={value === "draft" ? "outlined" : "filled"} /> },
    { field: "productFamily", headerName: "Product family", width: 155, valueFormatter: (value) => value === "construction" ? "Construction" : "DSCR" },
    { field: "loanAmount", headerName: "Loan amount", width: 170, type: "number", editable: canWrite, valueFormatter: (value) => amount(value as string | number), ...(canWrite ? { cellClassName: "editable-cell" } : {}) },
    { field: "rate", headerName: "Rate", width: 125, valueFormatter: (value) => value == null ? "Unspecified" : `${value}%` },
    { field: "updatedAt", headerName: "Last updated", width: 155, valueFormatter: (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(String(value))) },
    { field: "open", headerName: "", width: 65, sortable: false, filterable: false, renderCell: ({ row }) => <IconButton component={Link} to={`/scenarios/${row.id}`} aria-label={`Open ${row.name}`} size="small"><ArrowForwardRounded fontSize="small" /></IconButton> },
  ], [canWrite]);

  if (scenarios.isLoading) return <LoadingState label="Loading scenarios" />;
  if (scenarios.isError) return <ErrorState error={scenarios.error} retry={() => void scenarios.refetch()} />;
  const rows = scenarios.data?.items ?? [];
  const onPaginationChange = ({ page }: GridPaginationModel) => {
    if (page === stack.length) return;
    const nextStack = page < stack.length ? stack.slice(0, page) : page === stack.length + 1 && scenarios.data?.nextCursor ? [...stack, scenarios.data.nextCursor] : stack;
    const next = new URLSearchParams(search);
    next.set("cursorStack", JSON.stringify(nextStack));
    setSearch(next);
  };
  const saveView = () => {
    const label = viewLabel.trim();
    if (!label) return;
    const nextViews = [...savedViews.filter((view) => view.label !== label), { label, q, status, family }];
    setSavedViews(nextViews);
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(nextViews));
    setViewLabel("");
  };

  return <Stack spacing={3}>
    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "flex-end" }} gap={2}>
      <Box><Typography variant="overline" color="primary.main" fontWeight={800} letterSpacing=".14em">LENDING PIPELINE</Typography><Typography variant="h4" sx={{ mt: .5 }}>Scenarios</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>Review loan proposals, update assumptions, and track each decision.</Typography></Box>
    </Stack>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Chip icon={<TuneRounded />} label={`${scenarios.data?.items.length ?? 0} shown`} variant="outlined" />
      {savedViews.map((view) => <Chip key={view.label} icon={<BookmarkBorderRounded />} label={view.label} clickable onClick={() => { const next = new URLSearchParams(search); for (const [key, value] of [["q", view.q], ["status", view.status], ["family", view.family]] as const) value ? next.set(key, value) : next.delete(key); next.delete("cursorStack"); setSearch(next); }} />)}
    </Stack>
    <Card>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ p: 2, borderBottom: "1px solid #e8ece9" }}>
        <TextField size="small" placeholder="Search scenarios" value={q} onChange={(event) => updateFilter("q", event.target.value)} sx={{ flex: 1, minWidth: 220 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} inputProps={{ "aria-label": "Search scenarios" }} />
        <FormControl size="small" sx={{ minWidth: 155 }}><InputLabel id="status-filter-label">Status</InputLabel><Select labelId="status-filter-label" value={status} label="Status" onChange={(event) => updateFilter("status", event.target.value)}><MenuItem value="">All statuses</MenuItem>{statuses.map((value) => <MenuItem key={value} value={value}>{value[0]?.toUpperCase()}{value.slice(1)}</MenuItem>)}</Select></FormControl>
        <FormControl size="small" sx={{ minWidth: 165 }}><InputLabel id="family-filter-label">Product family</InputLabel><Select labelId="family-filter-label" value={family} label="Product family" onChange={(event) => updateFilter("family", event.target.value)}><MenuItem value="">All families</MenuItem><MenuItem value="construction">Construction</MenuItem><MenuItem value="dscr">DSCR</MenuItem></Select></FormControl>
        <FormControl size="small" sx={{ minWidth: 155 }}><InputLabel id="sort-filter-label">Sort by</InputLabel><Select labelId="sort-filter-label" value={sort} label="Sort by" onChange={(event) => updateFilter("sort", event.target.value)}><MenuItem value="updatedAt">Last updated</MenuItem><MenuItem value="loanAmount">Loan amount</MenuItem><MenuItem value="name">Scenario name</MenuItem></Select></FormControl>
        <FormControl size="small" sx={{ minWidth: 135 }}><InputLabel id="direction-filter-label">Order</InputLabel><Select labelId="direction-filter-label" value={direction} label="Order" onChange={(event) => updateFilter("direction", event.target.value)}><MenuItem value="desc">Newest first</MenuItem><MenuItem value="asc">Oldest first</MenuItem></Select></FormControl>
      </Stack>
      {gridError && <Alert severity={editAmount.isError ? "warning" : "error"} onClose={() => setGridError(null)}>{gridError}</Alert>}
      <Box sx={{ height: 540, width: "100%" }}>
        {rows.length === 0 ? <EmptyState title="No scenarios match" detail="Try changing your search or filters." /> : <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
          paginationMode="server"
          rowCount={-1}
          sortingMode="server"
          sortModel={[{ field: sort, sort: direction }]}
          onSortModelChange={(model) => { const item = model[0]; if (item?.field) { const next = new URLSearchParams(search); next.set("sort", item.field); next.set("direction", item.sort ?? "desc"); next.delete("cursorStack"); setSearch(next); } }}
          paginationModel={{ page: stack.length, pageSize: 25 }}
          paginationMeta={{ hasNextPage: Boolean(scenarios.data?.nextCursor) }}
          onPaginationModelChange={onPaginationChange}
          pageSizeOptions={[25]}
          isCellEditable={({ row }) => canWrite && row.rate !== null && row.termMonths !== null}
          processRowUpdate={(row) => editAmount.mutateAsync(row)}
          onProcessRowUpdateError={(error) => { if (!gridError) setGridError(error instanceof Error ? error.message : "Could not save the edited amount."); }}
          loading={editAmount.isPending}
          sx={{ border: 0, "& .editable-cell": { cursor: "cell" }, "& .MuiDataGrid-row:hover": { bgcolor: "#f8faf8" }, "& .MuiDataGrid-columnHeaders": { bgcolor: "#fafbfa" }, "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outlineColor: "primary.main" } }}
        />}
      </Box>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ borderTop: "1px solid #edf0ed", p: 1.5 }}>
        <Typography variant="caption" color="text.secondary">Page {stack.length + 1} · Edit a loan amount directly in the grid. Search, filters, and this cursor position are saved in the URL.</Typography>
      </Stack>
    </Card>
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}><TextField size="small" label="Save current view as" value={viewLabel} onChange={(event) => setViewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveView(); }} sx={{ maxWidth: 280 }} /><Button size="small" onClick={saveView} disabled={!viewLabel.trim()}>Save view</Button></Stack>
  </Stack>;
}
