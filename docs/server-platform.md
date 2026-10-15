# Server platform package

`@vnext/server-platform` supplies shared Express composition and narrow integration interfaces for both APIs. It provides request and actor context, RFC 9457 style problem responses, session and permission guards, typed flags, structured request logging, telemetry bootstrap, and a transaction boundary that requires business, audit, and archive-outbox writes to share one transaction.

## Composition

Create each app through `createApplication({ app, environment, version, resolveActor, resolveBusinessUnit, routes, readiness })`. Mount session resolution through `resolveActor`; it must load the opaque server-side session and derive both actor identity and permissions. Do not accept actor or permission values from request bodies or headers. `resolveBusinessUnit` must validate a selected context against server policy. Add same-origin/origin and CSRF middleware in each API before mutation routes.

Use `requireSession()` and `requirePermission('scenarios.write')` at route boundaries. The package does not store sessions, hash passwords, assign roles, or implement cookie/origin policy. Those remain API/provider work. Known HTTP failures use `HttpProblem`; other exceptions return a sanitized 500. The JSON error includes `code` and `requestId`, never stack traces. Validation can be represented with Zod errors.

## Flags and logs

`flagCatalog` owns keys, purposes, defaults, and safe failure values. `LocalFlagProvider` is deterministic. `SafeFlagProvider` contains provider errors. `LaunchDarklyFlagProvider` is an adapter boundary only; deployment startup must select a real provider explicitly and must not silently fall back to local mode.

Logs are JSON through Pino and enrich request completion with route template, status, duration, service context, request/trace IDs, and a limited actor reference. Avoid bodies, query strings, SQL parameters, credentials, and loan/customer data. Application Insights/OpenTelemetry packages are intentionally not installed here: call `initializeTelemetry` before importing instrumented app modules and supply the selected supported Azure Monitor provider from the owning API. Decide one authoritative application-log ingestion path and document container diagnostics separately; stdout collection alone does not guarantee correlated `AppTraces` records.

## Audited writes

Use `auditedMutation(database, input)` for a mutation. Its adapter must execute `run`, append the immutable audit event, and add the pending archive outbox row on the same database transaction handle. A failed audit/outbox insert must reject the callback and roll back the business write. Return `changed: false` when no effective value changed. The field allowlist and redaction sets are code-owned. Keep append/update/delete controls in the database principal and repository implementation; TypeScript interfaces cannot enforce SQL permissions.

The package contains no SQL Server implementation, session store, password-auth flow, LaunchDarkly SDK, or Azure Monitor exporter. API and database packages provide those concrete adapters and must verify provider versions and failure behavior before describing them as operational.
