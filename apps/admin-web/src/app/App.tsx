import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoadingState, vnextTheme } from "@vnext/ui";
import { AdminShell } from "./AdminShell.js";

const MetadataWorkspace = lazy(() => import("../features/metadata/MetadataWorkspace.js").then((module) => ({ default: module.MetadataWorkspace })));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 }, mutations: { retry: false } } });

export function App() {
  return <ThemeProvider theme={vnextTheme}><CssBaseline /><QueryClientProvider client={queryClient}><BrowserRouter><Suspense fallback={<LoadingState label="Loading configuration studio" />}><Routes><Route element={<AdminShell />}><Route index element={<Navigate to="/metadata" replace />} /><Route path="metadata" element={<MetadataWorkspace />} /><Route path="*" element={<Navigate to="/metadata" replace />} /></Route></Routes></Suspense></BrowserRouter></QueryClientProvider></ThemeProvider>;
}
