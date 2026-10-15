import { ApiClient } from "@vnext/api-client";
import { currentUserSchema, loginRequestSchema } from "@vnext/contracts";
import type { CurrentUserDto } from "@vnext/contracts";
import { useQuery } from "@tanstack/react-query";

const api = new ApiClient();

export const authKeys = { currentUser: ["auth", "currentUser"] as const };

export function getCurrentUser(signal?: AbortSignal): Promise<CurrentUserDto> {
  return api.request("/api/auth/me", currentUserSchema, { signal });
}

export function useCurrentUser() {
  return useQuery({ queryKey: authKeys.currentUser, queryFn: ({ signal }) => getCurrentUser(signal), staleTime: 60_000, retry: false });
}

export function login(email: string, password: string): Promise<CurrentUserDto> {
  const body = loginRequestSchema.parse({ email, password });
  return api.request("/api/auth/login", currentUserSchema, { method: "POST", body: JSON.stringify(body) });
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Could not sign out.");
}
