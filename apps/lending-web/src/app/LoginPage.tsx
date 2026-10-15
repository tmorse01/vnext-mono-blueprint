import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import AccountBalanceRounded from "@mui/icons-material/AccountBalanceRounded";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { ApiError } from "@vnext/api-client";
import { login, authKeys } from "./auth.js";

export function LoginPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(import.meta.env.VITE_LOCAL_USER_EMAIL ?? "developer@vnext.test");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (user) => { queryClient.setQueryData(authKeys.currentUser, user); },
    retry: false,
  });
  const errorMessage = mutation.error instanceof ApiError && mutation.error.status === 401 ? "Email or password is incorrect." : mutation.error instanceof Error ? mutation.error.message : "Sign in failed. Check the lending API and try again.";

  return <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, background: "radial-gradient(circle at top left, #e7eee9, transparent 42%), #f4f6f4" }}>
    <Card sx={{ maxWidth: 430, width: "100%" }}><CardContent sx={{ p: { xs: 3, sm: 4 } }}>
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1.2} alignItems="center"><Box sx={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 2, bgcolor: "primary.main", color: "white" }}><AccountBalanceRounded /></Box><Box><Typography variant="h6">Northstar Capital</Typography><Typography variant="caption" color="text.secondary">Lending workspace</Typography></Box></Stack>
        <Box><Typography variant="h5">Sign in</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Use your developer account to open the synthetic lending workspace.</Typography></Box>
        {mutation.isError && <Alert severity="error">{errorMessage}</Alert>}
        <Box component="form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <Stack spacing={2}>
            <TextField autoComplete="username" label="Email address" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField autoComplete="current-password" label="Password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <Button type="submit" variant="contained" size="large" startIcon={<LockOutlined />} disabled={mutation.isPending || !password}>{mutation.isPending ? "Signing in…" : "Sign in"}</Button>
          </Stack>
        </Box>
        <Alert severity="info" icon={false} sx={{ fontSize: 12 }}>For local development, run <b>pnpm setup:local</b>. It provisions the configured <code>LOCAL_USER_EMAIL</code> and prints the generated password once in the setup terminal. This app never stores a password in browser storage.</Alert>
      </Stack>
    </CardContent></Card>
  </Box>;
}
