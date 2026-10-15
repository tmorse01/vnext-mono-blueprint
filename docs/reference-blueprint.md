# VNext monorepo reference architecture and Codex handoff

Status: implementation brief for a clean-room reference repository.
Prepared: October 15, 2026.
Purpose: demonstrate a consistent architecture for an enterprise construction lender, suitable for a Builders Capital VNext discussion.
Use synthetic organizations, people, loans, and pricing. No existing company schemas, credentials, integrations, proprietary rules, or customer data are required.

## 1. Architecture at a glance

Build a pnpm workspace orchestrated by Turborepo, with TypeScript throughout. Start with a primary lending application and modular Express API, an administrative application, and an integration API. The repository is the collaboration boundary; each application remains a separate deployment artifact.

| Application | Responsibility |
| --- | --- |
| lending-web | Organizations, people, loans, scenarios, product selection, editable scenario tables |
| admin-web | Business-unit configuration, field metadata drafts, preview, publish, and audit history |
| lending-api | Core business operations, identity, permissions, metadata, authoritative validation, and lending writes |
| integrations-api | Third-party adapter and webhook example; owns integration state and calls lending-api for lending changes |

Organize domain features inside the main applications first. Extract packages when there is real sharing or an enforceable architectural boundary. Avoid a package per entity, a universal CRUD framework, microfrontends, event sourcing, and a generic workflow engine.

Business units configure a shared platform. Organizations, people, and loans are shared data; business units are not security tenants. They select product availability, defaults, labels, and supported layout settings. Users still require server-enforced roles and permissions for operations.

Construction and DSCR products share common concepts but can have different form sections, additional relational fields, validation, and explicit code extensions. Product family drives those differences; business unit chooses which families and products it offers. Do not turn product differences into a giant form full of business-unit conditionals.

## 2. Key defaults

| Concern | Decision |
| --- | --- |
| Workspace | pnpm workspaces, one lockfile, centralized dependency versions, Turborepo task graph/cache |
| Frontend | React, Vite, React Router, route-level lazy loading |
| UI | MUI and MUI X Community; no paid license required |
| Server state | TanStack Query, feature-owned query options and mutation hooks |
| Forms | TanStack Form with Zod; supported metadata becomes runtime validation |
| HTTP | REST, OpenAPI, shared runtime schemas and DTOs, small native-fetch client |
| Backend | Express with consistent application factory, middleware, errors, and feature modules |
| Database | SQL Server, Kysely, version-controlled migrations and synthetic development seeds |
| Identity | Email/password, established password-hashing library, opaque server-side sessions, role permissions |
| Feature flags | Typed flag catalog, LaunchDarkly server adapter, deterministic local provider |
| Operations | Structured logging, OpenTelemetry, Application Insights, Log Analytics |
| Audit | Transactional append-only SQL audit records, separate durable archive delivery |
| Delivery | GitHub Actions, Linux/amd64 containers, Azure Container Apps, Terraform |
| Git | Short-lived branches into main; temporary release stabilization branches |
| Tests | Vitest, Supertest, React Testing Library, MSW, Playwright, real SQL Server integration tests |

Native fetch is the initial transport. Do not install both fetch and Axios wrappers. Transport-specific details stay inside api-client so choosing Axios later does not change domain query hooks.

## 3. Repository shape

Suggested directories, with adjustments allowed when they reduce complexity:

    apps/
      lending-web/
        src/app/                 bootstrap, router, providers, layouts
        src/features/            organizations, people, loans, scenarios
      admin-web/
        src/app/
        src/features/            metadata, business-units, audit
      lending-api/
        src/app/                 app factory, middleware composition, lifecycle
        src/modules/             auth, organizations, people, loans, scenarios, metadata, audit
      integrations-api/
        src/app/
        src/modules/             example-provider, webhooks
    packages/
      contracts/                 Zod API DTOs, endpoint definitions, OpenAPI generation
      api-client/                fetch transport, typed endpoint functions
      metadata/                  portable metadata schema, resolution, safe conditions
      ui/                        theme, layouts, fields, forms, tables, shared states
      db/                        Kysely connection, generated schema types, migrations, seeds
      server-platform/           request context, auth guards, logging, flags, audited mutations
      test-utils/                genuinely shared test builders and fixtures
    tooling/
      eslint/                    shared config and import restrictions
      typescript/                browser/server/package configurations
      generators/                small copy-template generators if useful
    infrastructure/terraform/
      modules/
      environments/
    .github/workflows/
    docs/recipes/

Shared backend facilities may use explicit server-platform subpath exports. Do not prematurely split every helper into a separate package.

## 4. Why this workspace helps

- One PR can change UI, API, contract, migration, and tests together.
- One install and one development command make onboarding predictable.
- A single version policy and lockfile reduce tool/library drift.
- Shared platform packages make standard behavior available across applications.
- Turborepo schedules dependent tasks and caches deterministic outputs.
- Import rules keep frontend, backend, contracts, and database code separated.
- A PR can produce a coordinated preview of all four applications.
- Separate container artifacts preserve independent production deployment.

A monorepo alone does not prevent architectural drift. The examples, boundary checks, ownership rules, and CI checks are part of the design.

## 5. Copy-ready Codex implementation prompt

Everything below this heading is a self-contained implementation brief. Give this file to Codex and ask it to implement this section.

### Objective and scope

Build a clean, reviewable reference monorepo demonstrating a uniform enterprise lending platform. This is a proposal and architecture example, not a production lending system. Favor a few working end-to-end paths over extensive nonfunctional scaffolding.

Implement the four applications and shared packages described below. Include executable local development, migrations, synthetic seeds, representative CI/CD and Terraform, recipes, and meaningful tests. No live cloud deployment or GitHub push is required. Do not create Azure resources or connect real external services during implementation.

Select currently supported, mutually compatible stable package versions. Verify official documentation at implementation time, pin the Node/pnpm toolchain, commit the lockfile, and document any compatibility substitutions. Keep runtime dependencies modest.

### A. Workspace, boundaries, and developer experience

Use pnpm workspaces and Turborepo. Provide root commands for dev, build, lint, typecheck, format checking, tests, API generation, migrations, seeds, and Terraform validation. Use one dependency version policy, using pnpm catalogs where appropriate.

Keep React apps separate from Express apps. Applications cannot import another application's source. Browser packages cannot import database code, server utilities, Node built-ins, or server environment values. Contracts and portable metadata cannot import React, Express, or Kysely. api-client depends on contracts, not on server implementation. Use package exports and ESLint import/boundary checks to enforce this. Do not assume Turbo task boundaries alone enforce architectural layering.

Use strict TypeScript, including unchecked-index and optional-property checks where practical. Avoid unexplained any, ignored errors, and project-wide lint exceptions. Use consistent ESM/module resolution compatible with the chosen tools, explicit package exports, and a strategy that works for development and built containers.

Cache only deterministic tasks. Include relevant config/environment inputs in task hashes. Never cache or remotely share secrets, mutable database state, or test output whose dependencies are not captured. Keep database integration tasks uncached unless their complete isolation and inputs justify caching.

Provide .env.example files, startup validation, documented ports, and clear failure messages. No cloud credentials should be needed locally.

Provide:

- pnpm setup:local: initialize local configuration without overwriting existing values, start SQL Server, wait for readiness, migrate, and idempotently seed synthetic data.
- pnpm dev: start both frontends and both APIs; start the configured local database if needed and run readiness checks. After setup, this is the normal daily command.
- Individual app dev commands and db:up, db:down, db:migrate, db:seed commands.
- An explicit destructive db:reset command requiring confirmation or an explicit flag.
- Graceful shutdown of HTTP listeners, pools, and telemetry.
- Linux/amd64 Dockerfiles, optional Compose for local infrastructure, health/readiness endpoints, and non-root application containers.
- A documented native connection-string path for developers using an existing SQL Server.

Do not silently reset a database or seed production data. Development bootstrap may orchestrate migrations; production APIs must not each run migrations on startup.

### B. Domain model and database

Use a fresh SQL Server schema. Separate concerns with a small number of schemas such as core, lending, config, iam, audit, and integrations.

Include these concepts:

- BusinessUnit.
- Organization and Person, with an explicit organization/person association and relationship role.
- Loan, with business-unit context and borrower/organization relationships.
- LoanProgram, LoanProduct, and ProductVersion.
- BusinessUnitProduct association.
- LoanScenario, scenario revision/version, and product-specific detail data.
- PricingVersion or PricingConfiguration and a saved illustrative PricingResult snapshot.
- MetadataRevision, publication/scope pointers, and supported business-unit overrides.
- User, Role, Permission, user-role association, and sessions.
- AuditEvent and durable archive/outbox delivery state.
- IntegrationDelivery/idempotency state.

Keep core lending data in normal relational columns with foreign keys, constraints, and indexes. Use explicit construction and DSCR detail tables where they clarify the model. Do not use entity-attribute-value storage for core domain fields. JSON is appropriate for validated layout/configuration documents and bounded snapshots, not as a substitute for the lending schema.

Use exact decimal handling for monetary values and ratios. Define SQL precision and scale deliberately; serialize decimals consistently, such as decimal strings, rather than relying on binary floating-point for lending calculations. Keep the example pricing calculation simple, deterministic, versioned, and clearly illustrative.

Use Kysely for queries and migrations. Keep repositories feature-specific. Do not introduce a generic BaseRepository/CRUD service hierarchy. Parameterize values, allowlist fields/operators used for filtering/sorting, and never interpolate metadata keys into SQL identifiers without a server-owned mapping.

Migrations must include schema changes and developer-controlled baseline definitions/reference data. Commit applied migration files unchanged; fix mistakes with new migrations. Migration history must not depend on live administrator edits. Use a serialized migration step per environment and the migration tool's locking. Production database expansion should precede dependent app releases; removal waits until old code no longer needs the schema.

Generate/check database TypeScript types from a migrated database, or provide an equally explicit drift check. Database types stay backend-only. Development seed data is separate from migrations and idempotent.

Use optimistic concurrency for scenario edits, metadata draft edits, and publishing. SQL Server rowversion or a correctly implemented atomic version column is suitable. Return a documented 409 or 412 conflict; never silently overwrite a stale edit. Use database principals scoped to each API's responsibility; the integration API cannot write lending tables directly.

### C. API contract and backend recipe

Use REST with OpenAPI. Define request/response runtime schemas and public DTOs in contracts. Reuse those definitions for server validation, types, client functions, and OpenAPI generation. Avoid maintaining four independent copies of a schema.

Runtime validation applies at trust boundaries. Shared TypeScript types alone are insufficient. Choose one coherent schema-to-OpenAPI approach that supports the selected Zod version.

For a standard endpoint, demonstrate:

    route + request schema
      -> session and permission guards
      -> feature service / transaction
      -> feature repository using Kysely
      -> mapped DTO / normalized error

Routes stay thin. Services coordinate business behavior. Repositories contain SQL. Do not create layers that only forward arguments without adding a useful boundary.

Use one createApplication composition pattern across both APIs. Include structured request context with actor, request ID, trace/span IDs, app/environment/version, and validated business-unit context. Derive identity from authenticated context, not client-supplied actor fields.

Normalize errors, validation errors, not-found responses, permission failures, concurrency conflicts, and dependency timeouts. Use a documented problem-details shape containing a safe error code and request ID. Keep internal stack traces out of responses.

List endpoints support bounded pagination, stable ordering, allowlisted filtering/sorting, and explicit result semantics. Never silently truncate a result and let the UI treat it as complete.

For small, explicitly complete datasets, the UI can filter/sort locally. Large datasets use server processing. Provide an explicit client/server table mode and preserve equivalent URL state. Do not guess from the number of rows in the first page.

Integration example: accept an authenticated mock-provider callback, validate and persist its idempotency key, and call the lending API to perform lending writes. The integration API owns its own integration state, not the lending repositories. Use a narrow service credential/permission for internal API calls. Mock the actual provider locally. Address timeouts and duplicate delivery without automatically retrying an unsafe mutation.

### D. Authentication, permissions, and flags

Implement email/password login, logout, current-user retrieval, secure password hashing through an established library, and opaque server-side sessions. Production cookies use Secure, HttpOnly, and deliberate SameSite settings. Use same-origin /api proxying for each frontend where practical; document origin validation/CSRF protection for cookie-authenticated mutations. Do not put bearer tokens in localStorage.

Use explicit permission keys such as scenarios.read, scenarios.write, metadata.edit, metadata.publish, and audit.read. Roles map to these permissions. Server authorization is authoritative. Navigation visibility and disabled UI affordances improve UX but never replace API checks.

Business units select configuration and products; they do not introduce record isolation in this reference architecture.

MFA, password reset, remembered-device behavior, and enterprise identity federation are documented extension points, not claimed implementations. Omit unfinished routes or return an explicit unsupported response if present. Never add endpoints that report success while doing nothing.

Provide a small typed feature-flag catalog with owner/purpose/default information, a deterministic local provider, and a LaunchDarkly server adapter. Production configuration must not silently use local demonstration flags. Include a safe default on provider timeout and a documented stale-cache policy. Server gates sensitive behavior; browser flag values expose only approved, nonsecret evaluations. Include user/business-unit targeting context where appropriate. Flags and permissions are distinct concerns.

### E. Metadata, drafts, and product extensions

Metadata should remove repetitive decisions, not execute arbitrary code.

Support labels, descriptions, group/section, order, formatting, defaults, required/min/max/length/enum rules, visibility, limited safe conditional rules, table columns, filter options, and supported navigation/layout settings.

Use a closed, typed metadata schema, a supported field/widget registry, and explicit renderer extensions. No eval, arbitrary JavaScript strings, general expression engine, or administrator-supplied SQL.

Stable field keys, database mappings, field types, and new relational columns are developer-controlled and changed through code/migrations. Business administrators may change only supported settings for known fields. A label change does not rename a database column.

Resolve platform defaults, product-family settings, and a shallow business-unit override. Define precedence explicitly and associate the effective result with a revision identifier. Personal saved views are separate user preferences and cannot change permissions, validation invariants, or data visibility.

Implement:

1. Create/edit a draft, using a version check.
2. Validate the draft against known fields and supported rules.
3. Preview it in the real renderer using an explicit authorized revision context.
4. Publish with permission checks, an atomic pointer change, revision checks, and audit events.
5. Revert by publishing a new revision referencing prior content; preserve history.

Draft preview must never change the default metadata for other users. Scope metadata query/cache keys by environment, product, business unit, and revision. Do not serve a draft from the published cache.

Lower environments can preview/publish their own revisions. Include a simple export/import mechanism for testing the same candidate configuration across environments. Preserve stable field identifiers, revalidate compatibility on import, and create a target-environment draft rather than copying source environment database IDs.

The editor captures the effective metadata revision and sends it with saves. The server detects incompatible changes to the active configuration and returns a clear reload-required response. Recheck versions atomically within the mutation boundary; avoid a check-then-save race.

Critical product constraints and permissions remain enforced by server-owned rules. Configurable validation cannot weaken them. Use the same portable supported-rule interpretation on the client and server, with explicit code extensions for exceptional validation.

Pricing snapshots preserve the selected product/pricing version, inputs, result, and relevant metadata revision. Do not silently recalculate historical results after configuration changes.

### F. Frontend recipes and editable data

Use React Router with lazy-loaded feature routes, a shared authenticated layout, navigation configuration, breadcrumbs, route error boundaries, and responsive page containers. Use ordinary semantic labels and keyboard behavior provided by the component library; a custom accessibility program is outside this prototype's scope.

Use TanStack Query for server state. Feature-owned query factories include all result-affecting inputs. Pass AbortSignal through query functions and api-client. Cancellation is not a user-facing failure.

Use a small native-fetch wrapper for credentials, JSON serialization, runtime response validation where useful, cancellation, timeouts, normalized errors, and request correlation. Do not build a large transport abstraction.

Use TanStack Form and shared MUI field adapters. Map supported metadata to widgets and Zod/runtime validation. Show a straightforward escape hatch for a hand-built product section and a custom validator.

Standardize loading, error/retry, empty, permission-denied, saved, saving, failed-save, and conflict states. Keep filters, sorting, search, and pagination in URL search parameters. Validate URL input and reset pagination when appropriate.

Demonstrate:

- A loan/scenario list with URL-persisted table state and saved views.
- One metadata-driven scenario form with common and product-family sections.
- A basic editable grid using MUI X Community-supported features.
- One reversible optimistic update with rollback and precise query invalidation.
- Debounced autosave of valid changes, visible save status, and unsaved-change protection.
- An admin metadata draft editor, preview, publish, and audit-history screen.

Keep autosave and grid editing manageable: serialize saves per record or use an explicit queue, retain dirty changes, do not let stale responses overwrite newer local values, and preserve dirty state on failures. Abort/cancellation does not prove a server mutation was rolled back. Use version checks and avoid blind retry loops for writes. Start with reload/reapply on concurrency conflicts; no real-time collaboration or automatic field merging is required.

Only complete local datasets may use client-side filtering. Provide a server-mode example or a focused implementation demonstrating equivalent endpoint/query semantics.

### G. Uniform audit history

Auditing is a standard write-path concern, not a per-route logging convention.

Implement a shared audited mutation/transaction facility and a small code-owned descriptor for each audited entity. It captures before/after field changes for supported operations and derives actor/request context automatically. Example features must use it for all business writes. Avoid repository access patterns that make bypass the normal development path; explain unavoidable raw-SQL escape hatches and require explicit audit handling there.

The business change, audit row, and archive delivery/outbox entry commit atomically in SQL Server. If audit persistence fails, the business mutation rolls back. If nothing changes, avoid misleading duplicate field-change events. Support system/service actors as well as humans.

Record event ID, UTC time, actor ID/type, action, entity type/ID, business-unit context when applicable, changed fields with redacted before/after values, metadata/product/pricing versions when relevant, correlation/trace ID, application, and deployment version. Use stable event IDs so archive retries can deduplicate.

Audit lending changes, organization/person changes, administrator configuration changes and publication, permissions/role changes, and meaningful identity/security events. Read/view/export history is outside scope. Authentication failures may be recorded as security events even when no business transaction occurs.

Use explicit field allowlists/redaction. Never store passwords, session tokens, secrets, entire HTTP bodies, or unnecessary personal information in audit or telemetry. Make sensitive-field policy code-owned; administrators cannot enable unrestricted secret logging through metadata.

Provide an append-only audit interface. The runtime database principal cannot update/delete audit events. Separate privileged migration/maintenance responsibilities; do not call SQL append-only permissions absolute tamper-proof storage.

Index audit queries by entity/time and actor/time; use bounded pagination and a separate read path. Avoid loading entire history into application memory. Document partitioning/time-based archival as volume grows, without prematurely adding complex partitions to the example.

Add an archive job entrypoint, launched separately from API request handling, that processes durable SQL outbox/checkpoint state in bounded batches and writes compressed immutable event batches to Blob Storage. It may use the existing backend image with a job command; a fifth application is not required. A filesystem implementation can demonstrate the path locally.

Delivery must support retry/backoff, bounded concurrency, worker crash recovery, duplicate-safe delivery, verification/checksums or manifests, and replay by event/time range from retained SQL history. Mark delivery complete only after durable archive acknowledgement. Blob immutability is configured as a deployment policy; do not permanently lock a real policy during demonstration setup.

Alert on oldest pending delivery age, retry failures, and archive lag. Do not delete hot audit data until verified archive completion and retention policy allow it. The runnable MVP may keep all audit rows in SQL; document the later archive/purge procedure explicitly.

Audit durability must not depend on Application Insights, telemetry sampling, or successful diagnostic export.

### H. Logging, Application Insights, and retention

Make observability a shared platform capability used identically by both APIs and both frontends.

Backend: initialize Microsoft's currently supported Node OpenTelemetry distribution/export path for Application Insights before importing instrumented application modules. Verify current package names and initialization guidance rather than copying an obsolete SDK example. Do not initialize two competing telemetry distributions.

Use structured JSON application logs with a shared logger and allowlisted enrichment: service name, environment, release/commit SHA, request ID, trace/span IDs, route template, duration, actor reference where appropriate, and outcome. A small established structured logger such as Pino is suitable. Verify and document how its logs reach AppTraces or the selected custom table; stdout collection alone must not be mistaken for correlated Application Insights application logs.

Avoid duplicate ingestion if both an SDK log exporter and Container Apps stdout collection are enabled. Document which path is authoritative for application logs and which is infrastructure/container diagnostics.

Capture requests, exceptions, outgoing HTTP dependencies, SQL timing/dependencies where supported, and a few domain spans/metrics. Include event-loop lag, pool saturation/timeouts, API latency/error rate, and integration failure examples. Do not attach raw SQL parameters, access tokens, full URLs with sensitive query strings, or loan/customer payloads.

Frontend: use the supported Application Insights browser SDK for route/page views, safe exceptions, and HTTP correlation. Restrict correlation headers to approved API origins. Verify lazy-route navigation tracking and source-map handling without publishing secrets. Browser configuration contains no server credentials.

Provide development console behavior without requiring Azure credentials. Telemetry outage must not make normal API reads/writes unavailable; bounded buffering/drop behavior and exporter errors must be observable. Telemetry is best-effort; audit persistence has a stronger transactional guarantee.

Explicit proposed retention defaults:

| Data | Interactive/hot | Total retained history | Retrieval |
| --- | --- | --- | --- |
| Operational application telemetry | 90 days | 730 days in Log Analytics | Normal recent queries; search jobs for older retained Analytics data |
| Business/security audit events | 365 days hot SQL target | At least 7 years, configurable archive policy | Audit API for hot data; manifest-driven archive retrieval for older events |
| Preview diagnostics | Short configurable retention, e.g. 14 days | Short preview policy | Preview troubleshooting |

Preview retention must use a separate workspace/policy or another supported resource boundary. Do not imply that one table's retention can vary by an environment field. Use a provider-supported retention duration if 14 days is unavailable for the chosen table/resource plan.

These are proposed technical defaults, not a statement of Builders Capital's approved retention requirements. Make them explicit Terraform/application variables and document how to change them. Audit rows remain in SQL until safe verified archival; the hot target is not permission to purge unarchived history.

Configure workspace and individual table analytics/total retention explicitly. Workspace defaults alone do not establish every table's long-term retention. Validate Terraform provider support; use a pinned supported API/provider path if necessary and document the reason. Do not silently omit total retention because a provider field is unavailable. Protect production audit storage and monitoring resources against accidental destruction, separate their lifecycle from preview cleanup, and make retention reductions visible in infrastructure review.

Azure Monitor currently documents up to 12 years of total Log Analytics retention, with older Analytics data retrieved through search jobs. Include the actual configured values in an operations verification checklist.

Blob archive is the authoritative long-term copy for audit events. Diagnostic table export is optional defense in depth for operational data. If enabled, monitor failures and document finite retry behavior and a historical replay procedure. Azure Monitor continuous export can discard data after its retry window; it must not be described as lossless backup.

Provide sample KQL for a request across services, recent failures, slow dependencies, release regressions, and exporter/archive errors. Include alerts for API error rate/latency, restart loops, database/pool pressure, telemetry ingestion gaps or last-seen checks where supported, export errors, and audit archive lag. Define alert routing as configurable; do not send notifications to real people during implementation.

Document costs by driver rather than invented totals: ingestion GB/day, sampling volume, retention GB-month, archive storage/operations, retrieval jobs, and per-PR infrastructure. Sampling high-volume traces is allowed and must be explicit. Never sample audit records. A daily ingestion cap can suppress diagnostics; do not present it as a harmless cost setting or use it without an alert/runbook.

Database backups, audit history, and observability retention are separate. A backup is not an audit query system, and diagnostics are not the audit source of truth. Document a concrete historical investigation procedure joining audit entity/event time to trace IDs and, when necessary, a separately restored database backup.

### I. CI/CD, previews, and Terraform

Use GitHub Actions with required checks for formatting, lint/import boundaries, type checking, unit/component tests, real SQL Server API/integration tests, relevant browser tests, production builds, contract/OpenAPI drift, and migration validation. Prefer meaningful behavior/invariant tests over superficial coverage targets.

Test migrations against an empty database and upgrade from a known prior fixture. Test schema/contract compatibility required for independent app deployment. A shared TypeScript build at one commit does not prove compatibility with an older deployed API.

Use CODEOWNERS suggestions and document GitHub branch protection/environment settings that must be configured outside repository files. Include dependency/security scanning without assuming paid GitHub features are available.

One PR produces one coordinated preview deployment group containing all four applications and a separate synthetic seeded database. Never let PRs share mutable schema/data. A logical Azure SQL server can be shared if each PR has an isolated database and appropriate credentials. Use one shared nonproduction Container Apps environment initially, with per-PR app resources; separate full environments remain an optional isolation choice.

Always deploy all four preview apps. Build affected artifacts using the dependency graph and reuse explicitly pinned compatible images for unaffected apps only when that is simpler and correct; otherwise build all four initially. Record exact image digests and revision/commit information.

Provide lifecycle workflows for create/update, concurrency cancellation, smoke/browser tests, and cleanup on PR close. A cancellation may interrupt cleanup, so include TTL-based orphan cleanup and expired-preview handling. Give preview databases, credentials, apps, and storage a unique PR scope. Preview workflows must not expose secrets to untrusted fork code.

Use Terraform for Azure Container Registry, Container Apps environment/apps, Azure SQL, Key Vault or secret references, managed identities, Log Analytics, Application Insights, archive storage, retention settings, and representative alerts/jobs. Separate shared resources from per-PR resources/state.

Use remote Terraform state with locking and isolate preview state from shared and production state. Keep secrets out of source and avoid exposing sensitive Terraform outputs. Prefer GitHub OIDC for Azure deployment authentication and managed identities for Azure resource access where supported; document provider limitations and any required bootstrap identities.

Production: independently build/deploy applications. Group related changes in a PR without assuming simultaneous rollout. Run migrations once as an explicit deployment job. Use additive API/schema changes, compatibility checks, readiness gates, and deliberate rollout order. Record images, app versions, and migration state. Roll back an application to a compatible image rather than promising destructive down migrations are safe.

Use short-lived feature branches into main. Temporary release branches stabilize a cut release; fixes on them are promptly propagated to main. Do not introduce permanent develop branches. Demonstrate per-app version tags or release manifest entries so an independent release identifies its artifact unambiguously.

Terraform must be formatted and validated where the environment permits. Deployment files may require Azure subscription configuration; label unexecuted cloud validation honestly. No real deployment is required.

### J. Tests, recipes, and acceptance criteria

Use Vitest for unit tests, React Testing Library/MSW for UI behavior, Supertest against the real Express composition for API tests, Playwright for a few core journeys, and real SQL Server for query/migration/audit/concurrency integration tests. Isolate database tests; do not substitute SQLite for SQL Server behavior.

Prioritize these tests:

- A valid scenario edit commits both business and audit data.
- An audit insert failure rolls back the business mutation.
- A stale record version does not overwrite data.
- Incompatible metadata publication produces a reload-required save response.
- An unauthorized role cannot call write/publish endpoints.
- Draft metadata never leaks into normal published queries/caches.
- A supported metadata rule is enforced by both form behavior and the API.
- Feature flag provider failure follows a defined safe policy.
- An autosave failure retains dirty changes; stale responses do not erase newer edits.
- Duplicate integration delivery does not duplicate lending mutations.
- Archive retry/crash recovery preserves durable pending state and event identity.
- A client/server filter mode behaves consistently for its declared dataset semantics.
- Smoke journeys cover scenario editing and metadata draft-preview-publish.

Write practical recipes with real file references:

1. Add a domain field and migration.
2. Add a REST endpoint and permission.
3. Fetch data with a query and cancellation.
4. Add a metadata-driven form section or explicit custom section.
5. Add a URL-driven table with client/server processing.
6. Add an editable cell and safe autosave.
7. Add a lazy route and layout/navigation entry.
8. Add/publish a business-unit metadata override.
9. Add a feature flag and evaluate it on the server.
10. Investigate a bad record using audit history and Application Insights.
11. Create another React app or Express API using the established composition.
12. Run/clean up a PR preview and release an app independently.

If adding generators, keep them thin and based on these real examples. Do not build a generic code-generation framework.

Include a root README explaining pnpm/Turbo benefits, the one-command development flow, architectural boundaries, app ports, and the most useful demos. Include a concise architecture decision record, a small dependency diagram, domain diagram, operations/retention runbook, release workflow, and known limitations.

Deliver a repository where:

- A new developer can install, initialize SQL Server, and start all four applications with documented commands.
- At least one scenario page loads real seeded data from the API/database.
- Construction and DSCR examples demonstrate shared behavior plus a small explicit extension.
- Editing a scenario, inspecting its audit history, and previewing/publishing a metadata change work locally.
- Both APIs share actual middleware/observability/error/auth conventions.
- Frontend/backend boundary violations fail a check.
- No paid MUI license, Azure credential, LaunchDarkly account, or real external service is required locally.
- Required local checks pass, or concrete environment blockers and unexecuted checks are clearly reported.
- Cloud infrastructure and deferred security capabilities are not misrepresented as deployed or complete.

### K. Implementation sequence

1. Scaffold workspace, versions, shared config, boundary checks, and commands.
2. Establish SQL Server, migrations, synthetic fixtures, contracts, and the shared Express composition.
3. Implement identity/permissions, transactional audit, and one scenario read/edit path.
4. Implement frontend layout/query/form/table patterns and product-family extensions.
5. Implement metadata draft/preview/publish, configuration version checks, and audit UI.
6. Add integration example, typed feature flags, and consistent observability.
7. Add archive delivery example, retention definitions, operations queries/runbooks.
8. Add representative Terraform, PR previews, independent deployment workflows, and documentation.
9. Run appropriate checks, fix failures, and report what works and what remains illustrative.

Work through these stages persistently. Do not stop at a folder tree, a plan, disconnected mock pages, or TODO-only implementation. At the same time, do not expand this proposal into a full lending product.

## 6. Sources and implementation-time verification

The architecture choices above are the proposal; these sources verify specific tool capabilities and operational constraints. Check current official documentation again when implementation begins.

- Kysely SQL Server support: https://www.kysely.dev/docs/getting-started
- Kysely migrations: https://kysely-org.github.io/kysely-apidoc/classes/migration.Migrator.html
- TanStack Form validation: https://tanstack.com/form/latest/docs/framework/react/guides/validation
- MUI X licensing: https://mui.com/x/introduction/licensing/
- Turborepo boundaries: https://turborepo.dev/docs/reference/boundaries
- Container Apps Linux containers: https://learn.microsoft.com/en-us/azure/container-apps/containers
- Container Apps GitHub Actions: https://learn.microsoft.com/en-us/azure/container-apps/github-actions
- Application Insights OpenTelemetry setup: https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable?tabs=nodejs
- Application Insights browser SDK: https://learn.microsoft.com/en-us/azure/azure-monitor/app/javascript-sdk
- Log Analytics analytics/total retention: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/data-retention-configure
- Log Analytics export reliability and destination requirements: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/logs-data-export

