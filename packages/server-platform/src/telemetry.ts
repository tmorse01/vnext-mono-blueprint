export interface TelemetryHandle { shutdown(): Promise<void>; }
export interface TelemetryBootstrapOptions {
  readonly serviceName: string;
  readonly environment: string;
  readonly version: string;
  readonly initializeProvider: () => Promise<TelemetryHandle>;
  readonly onFailure?: (error: unknown) => void;
}

/** Call before importing application modules. Returns a no-op handle when telemetry is unavailable. */
export async function initializeTelemetry(options: TelemetryBootstrapOptions): Promise<TelemetryHandle> {
  try {
    return await options.initializeProvider();
  } catch (error) {
    options.onFailure?.(error);
    return { shutdown: async () => undefined };
  }
}
