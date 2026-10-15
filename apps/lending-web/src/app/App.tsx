import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vnextTheme, LoadingState } from "@vnext/ui";
import { AppShell } from "./AppShell.js";

const ScenarioList = lazy(() => import("../features/scenarios/ScenarioListPage.js").then((module) => ({ default: module.ScenarioListPage })));
const ScenarioDetail = lazy(() => import("../features/scenarios/ScenarioDetailPage.js").then((module) => ({ default: module.ScenarioDetailPage })));
const ScenarioAudit = lazy(() => import("../features/audit/AuditPage.js").then((module) => ({ default: module.AuditPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (count, error) => !(error instanceof Error && "status" in error && error.status === 401) && count < 2, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

export function App() {
  return <ThemeProvider theme={vnextTheme}><CssBaseline /><QueryClientProvider client={queryClient}><BrowserRouter><Suspense fallback={<LoadingState />}><Routes>
    <Route element={<AppShell />}>
      <Route index element={<Navigate to="/scenarios" replace />} />
      <Route path="scenarios" element={<ScenarioList />} />
      <Route path="scenarios/:scenarioId" element={<ScenarioDetail />} />
      <Route path="scenarios/:scenarioId/audit" element={<ScenarioAudit />} />
      <Route path="*" element={<Navigate to="/scenarios" replace />} />
    </Route>
  </Routes></Suspense></BrowserRouter></QueryClientProvider></ThemeProvider>;
}
