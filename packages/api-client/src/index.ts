import { problemDetailsSchema } from "@vnext/contracts";
import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  onRequestId?: (requestId: string) => void;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async request<T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}): Promise<z.infer<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), this.timeoutMs);
    const signals = [init.signal, controller.signal].filter((signal): signal is AbortSignal => signal !== undefined);
    const signal = AbortSignal.any(signals);
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body !== undefined) headers.set("content-type", "application/json");

    try {
      const response = await this.fetcher(new URL(path, this.baseUrl || globalThis.location?.origin || "http://localhost"), {
        ...init,
        headers,
        credentials: "include",
        signal,
      });
      const requestId = response.headers.get("x-request-id");
      if (requestId) this.options.onRequestId?.(requestId);
      const body: unknown = response.status === 204 ? undefined : await response.json();
      if (!response.ok) {
        const parsed = problemDetailsSchema.safeParse(body);
        if (parsed.success) throw new ApiError(response.status, parsed.data.code, parsed.data.detail ?? parsed.data.title, parsed.data.requestId, parsed.data.errors);
        throw new ApiError(response.status, "http_error", `Request failed with status ${response.status}`, requestId ?? undefined);
      }
      return schema.parse(body);
    } catch (error) {
      if (error instanceof ApiError || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new ApiError(408, "request_timeout", "The request timed out.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
