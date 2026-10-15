import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Avatar, Box, Breadcrumbs, Button, Card, CardContent, Chip, Container, Divider, Stack, Typography } from "@mui/material";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import HistoryRounded from "@mui/icons-material/HistoryRounded";
import { EmptyState, ErrorState, LoadingState } from "@vnext/ui";
import { getScenario, getScenarioAudit, scenarioKeys } from "../scenarios/api.js";
import { useCurrentUser } from "../../app/auth.js";

export function AuditPage() {
  const { scenarioId = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const cursor = search.get("cursor") ?? undefined;
  const currentUser = useCurrentUser();
  const canReadAudit = currentUser.data?.permissions.includes("audit.read") ?? false;
  const scenario = useQuery({ queryKey: scenarioKeys.detail(scenarioId), queryFn: ({ signal }) => getScenario(scenarioId, signal), enabled: Boolean(scenarioId) });
  const events = useQuery({ queryKey: [...scenarioKeys.audit(scenarioId), cursor ?? "first"], queryFn: ({ signal }) => getScenarioAudit(scenarioId, cursor, signal), enabled: Boolean(scenarioId) && canReadAudit });
  if (currentUser.isLoading) return <LoadingState label="Checking audit permissions" />;
  if (!canReadAudit) return <Container maxWidth="sm" sx={{ py: 8 }}><Alert severity="error">Your account does not have permission to read audit history.</Alert></Container>;
  if (scenario.isLoading || events.isLoading) return <LoadingState label="Loading audit history" />;
  if (scenario.isError || events.isError || !scenario.data || !events.data) return <ErrorState error={scenario.error ?? events.error ?? new Error("Audit history is unavailable.")} retry={() => { void scenario.refetch(); void events.refetch(); }} />;
  const nextPage = () => {
    if (!events.data.nextCursor) return;
    setSearch({ cursor: events.data.nextCursor });
  };

  return <Stack spacing={2.5}>
    <Breadcrumbs aria-label="Breadcrumb"><Link to="/scenarios">Scenarios</Link><Link to={`/scenarios/${scenarioId}`}>{scenario.data.scenario.name}</Link><Typography color="text.primary">Audit history</Typography></Breadcrumbs>
    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "flex-end" }} justifyContent="space-between" gap={2}>
      <Box><Button component={Link} to={`/scenarios/${scenarioId}`} size="small" startIcon={<ArrowBackRounded />} sx={{ mb: 1, pl: 0 }}>Back to scenario</Button><Typography variant="h4">Audit history</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>{scenario.data.scenario.name} · Recorded changes and their actors.</Typography></Box>
      <Chip icon={<HistoryRounded />} label="Append-only history" variant="outlined" />
    </Stack>
    <Alert severity="info">Audit history records completed writes. Reading or exporting this page does not create an audit event.</Alert>
    {events.data.items.length === 0 ? <Card><EmptyState title="No history yet" detail="Changes to this scenario will appear here." /></Card> : <Stack spacing={1.5}>
      {events.data.items.map((event) => <Card key={event.id}><CardContent sx={{ p: { xs: 2.25, md: 3 } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start"><Avatar sx={{ width: 36, height: 36, bgcolor: "#e4eee9", color: "primary.main", fontSize: 13, fontWeight: 700 }}>{(event.actorDisplayName ?? event.actorType).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</Avatar><Box sx={{ flex: 1, minWidth: 0 }}><Stack direction={{ xs: "column", sm: "row" }} spacing={.75} alignItems={{ sm: "center" }} justifyContent="space-between"><Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={700}>{event.actorDisplayName ?? event.actorType}</Typography><Chip size="small" label={event.actorType} variant="outlined" /></Stack><Typography variant="caption" color="text.secondary">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{event.action.replaceAll(".", " ")}</Typography><Divider sx={{ my: 1.5 }} />
          {event.changes.length === 0 ? <Typography variant="body2" color="text.secondary">No field-level changes were recorded.</Typography> : <Stack spacing={1}>{event.changes.map((change) => <Stack key={change.field} direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between" sx={{ p: 1.1, borderRadius: 1.5, bgcolor: "#f7f9f7" }}><Typography variant="body2" fontWeight={650}>{change.field.split(".").map((part) => part.replace(/([A-Z])/g, " $1")).join(" · ")}</Typography><Typography variant="body2" color="text.secondary">{change.before === undefined ? "—" : String(change.before)} <Box component="span" sx={{ mx: .75, color: "text.disabled" }}>→</Box> {change.after === undefined ? "—" : String(change.after)}</Typography></Stack>)}</Stack>}
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5 }}>Request {event.requestId ?? "not available"}</Typography>
        </Box></Stack>
      </CardContent></Card>)}
      <Stack direction="row" justifyContent="space-between" alignItems="center"><Button disabled={!cursor} onClick={() => setSearch({})}>First page</Button><Button variant="outlined" disabled={!events.data.nextCursor} onClick={nextPage}>Next page</Button></Stack>
    </Stack>}
  </Stack>;
}
