import { Outlet, NavLink } from "react-router";
import { AppBar, Box, Button, Chip, Container, Stack, Toolbar, Typography } from "@mui/material";
import AccountBalanceRounded from "@mui/icons-material/AccountBalanceRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import { useQuery } from "@tanstack/react-query";
import { defaultScope } from "../features/metadata/fixtures.js";
import { getCurrentUser, getDrafts, metadataKeys } from "../features/metadata/api.js";

export function AdminShell() {
  const currentUser = useQuery({ queryKey: ["current-user"], queryFn: ({ signal }) => getCurrentUser(signal) });
  const workspace = useQuery({ queryKey: metadataKeys.drafts(defaultScope), queryFn: ({ signal }) => getDrafts(defaultScope, signal) });
  const displayName = currentUser.data?.actor.displayName ?? "Configuration user";
  const initials = displayName.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
  const environment = workspace.data?.environment ?? "local";
  return <Box sx={{ minHeight: "100vh" }}>
    <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid #e5eae6" }}><Toolbar sx={{ minHeight: "68px !important", gap: 2 }}>
      <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: { xs: 195, md: 245 } }}><Box sx={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 2, bgcolor: "primary.main", color: "white" }}><AccountBalanceRounded fontSize="small" /></Box><Box><Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>Northstar Capital</Typography><Typography variant="caption" color="text.secondary">Configuration studio</Typography></Box></Stack>
      <Stack direction="row" spacing={0.5} sx={{ flex: 1 }}><Button component={NavLink} to="/metadata" startIcon={<TuneRounded />} sx={{ color: "text.primary", "&.active": { bgcolor: "#edf3ef", color: "primary.main" } }}>Metadata</Button></Stack>
      <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={`${environment.toUpperCase()} ENVIRONMENT`} variant="outlined" sx={{ display: { xs: "none", sm: "flex" }, borderColor: "#d8e4dd", color: "primary.main", fontWeight: 700, fontSize: 10 }} /><Typography variant="body2" fontWeight={600}>{displayName}</Typography><Box sx={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "#e5d7c7", color: "#69462d", fontWeight: 700, fontSize: 12 }}>{initials || "CU"}</Box></Stack>
    </Toolbar></AppBar>
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}><Outlet /></Container>
    <Box component="footer" sx={{ borderTop: "1px solid #e5eae6", py: 2.5, mt: 8 }}><Container maxWidth="xl"><Typography variant="caption" color="text.secondary">Northstar Capital · Synthetic configuration workspace · For demonstration only</Typography></Container></Box>
  </Box>;
}
