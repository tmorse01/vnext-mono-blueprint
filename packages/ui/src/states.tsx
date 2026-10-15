import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import ReplayRounded from "@mui/icons-material/ReplayRounded";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <Stack direction="row" spacing={1.5} alignItems="center" role="status" sx={{ py: 5, justifyContent: "center" }}><CircularProgress size={20} /><Typography color="text.secondary">{label}…</Typography></Stack>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <Box sx={{ p: 6, textAlign: "center" }}><Typography variant="h6">{title}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{detail}</Typography></Box>;
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return <Alert severity="error" action={retry && <Button color="inherit" size="small" startIcon={<ReplayRounded />} onClick={retry}>Retry</Button>}>{message}</Alert>;
}

export function ConflictState({ onReload }: { onReload: () => void }) {
  return <Alert severity="warning" action={<Button color="inherit" size="small" startIcon={<ReplayRounded />} onClick={onReload}>Reload latest</Button>}>This scenario changed elsewhere. Your edits are still shown; reload the latest version before applying them again.</Alert>;
}
