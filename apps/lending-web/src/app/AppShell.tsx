import { Outlet, NavLink } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AppBar, Box, Button, Chip, Container, IconButton, Stack, Toolbar, Typography } from "@mui/material";
import AccountBalanceRounded from "@mui/icons-material/AccountBalanceRounded";
import GridViewRounded from "@mui/icons-material/GridViewRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import { ApiError } from "@vnext/api-client";
import { ErrorState, LoadingState } from "@vnext/ui";
import { authKeys, logout, useCurrentUser } from "./auth.js";
import { LoginPage } from "./LoginPage.js";

export function AppShell() {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const signOut = useMutation({ mutationFn: logout, onSuccess: async () => { queryClient.removeQueries({ queryKey: authKeys.currentUser }); await queryClient.invalidateQueries(); }, retry: false });
  if (currentUser.isLoading) return <LoadingState label="Checking your session" />;
  if (currentUser.error instanceof ApiError && currentUser.error.status === 401) return <LoginPage />;
  if (currentUser.isError || !currentUser.data) return <ErrorState error={currentUser.error ?? new Error("Your session could not be checked.")} retry={() => void currentUser.refetch()} />;
  const user = currentUser.data;
  if (!user.permissions.includes("scenarios.read")) return <Container maxWidth="sm" sx={{ py: 10 }}><Alert severity="error">Your account does not have permission to read scenarios.</Alert></Container>;
  const displayName = user.actor.displayName ?? "Signed-in user";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <Box sx={{ minHeight: "100vh" }}>
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid #e5eae6" }}>
      <Toolbar sx={{ minHeight: "68px !important", gap: 2 }}>
        <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: 245 }}>
          <Box sx={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 2, bgcolor: "primary.main", color: "white" }}><AccountBalanceRounded fontSize="small" /></Box>
          <Box><Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>Northstar Capital</Typography><Typography variant="caption" color="text.secondary">Lending workspace</Typography></Box>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ flex: 1 }}>
          <Button component={NavLink} to="/scenarios" startIcon={<GridViewRounded />} sx={{ color: "text.primary", "&.active": { bgcolor: "#edf3ef", color: "primary.main" } }}>Scenarios</Button>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label="DEMO ENVIRONMENT" variant="outlined" sx={{ borderColor: "#d8e4dd", color: "primary.main", fontWeight: 700, fontSize: 10 }} /><Typography variant="body2" fontWeight={600}>{displayName}</Typography><Box sx={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "#e5d7c7", color: "#69462d", fontWeight: 700, fontSize: 12 }}>{initials}</Box><IconButton aria-label="Sign out" size="small" onClick={() => signOut.mutate()} disabled={signOut.isPending}><LogoutRounded fontSize="small" /></IconButton></Stack>
      </Toolbar>
    </AppBar>
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}><Outlet /></Container>
    <Box component="footer" sx={{ borderTop: "1px solid #e5eae6", py: 2.5, mt: 8 }}><Container maxWidth="xl"><Typography variant="caption" color="text.secondary">Northstar Capital · Synthetic reference workspace · For demonstration only</Typography></Container></Box>
  </Box>;
}
