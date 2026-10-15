export interface FlagDefinition {
  readonly owner: string;
  readonly purpose: string;
  readonly defaultValue: boolean;
  readonly failureValue: boolean;
}

export const flagCatalog = {
  scenarioAutosave: { owner: 'Lending', purpose: 'Enable scenario autosave UI and API behavior.', defaultValue: true, failureValue: false },
  metadataDraftPreview: { owner: 'Metadata', purpose: 'Enable authorized metadata draft preview.', defaultValue: true, failureValue: false },
  illustrativePricing: { owner: 'Lending', purpose: 'Enable illustrative pricing snapshots.', defaultValue: true, failureValue: false },
} as const satisfies Readonly<Record<string, FlagDefinition>>;

export type FlagKey = keyof typeof flagCatalog;
export interface FlagContext {
  readonly actorId?: string;
  readonly businessUnitId?: string;
}
export interface FlagProvider {
  evaluate(key: FlagKey, context: FlagContext): Promise<boolean>;
}

/** Local values are deterministic and process-configured; they are not production targeting. */
export class LocalFlagProvider implements FlagProvider {
  constructor(private readonly overrides: Partial<Record<FlagKey, boolean>> = {}) {}
  async evaluate(key: FlagKey, _context: FlagContext): Promise<boolean> {
    return this.overrides[key] ?? flagCatalog[key].defaultValue;
  }
}

export class SafeFlagProvider implements FlagProvider {
  constructor(private readonly provider: FlagProvider, private readonly onFailure: (error: unknown) => void = () => undefined) {}
  async evaluate(key: FlagKey, context: FlagContext): Promise<boolean> {
    try { return await this.provider.evaluate(key, context); }
    catch (error) { this.onFailure(error); return flagCatalog[key].failureValue; }
  }
}

/** Production LaunchDarkly adapter should implement this narrow interface and fail startup if absent. */
export interface LaunchDarklyClient {
  variation(key: string, context: FlagContext, fallback: boolean): Promise<boolean>;
}
export class LaunchDarklyFlagProvider implements FlagProvider {
  constructor(private readonly client: LaunchDarklyClient) {}
  evaluate(key: FlagKey, context: FlagContext): Promise<boolean> {
    return this.client.variation(key, context, flagCatalog[key].failureValue);
  }
}
