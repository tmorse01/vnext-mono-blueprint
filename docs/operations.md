# Operations and delivery reference

This repository contains deployment examples, not a deployed environment. Terraform plans and applies can create billable Azure resources; this implementation does not run them. Treat retention values as proposed engineering defaults, then obtain the data owner's approval before production use.

## Local development and containers

The SQL Server Compose service is in `infrastructure/compose.yaml`. It uses the SQL Server 2022 Developer image for Linux/amd64, a named volume for local persistence, loopback-only port binding, and a readiness probe. Set a synthetic, local-only `DB_PASSWORD` in an ignored `.env` file; Compose passes that value to SQL Server's `MSSQL_SA_PASSWORD` setting. Do not reuse a real password. Developer Edition is for local development only. Compose currently starts SQL Server only; the application images are built and run separately.

The four workspace-aware, multi-stage Dockerfiles live in `infrastructure/containers/`. Build them from the repository root so pnpm can resolve workspace dependencies:

```sh
docker build --platform=linux/amd64 -f infrastructure/containers/Dockerfile.lending-web -t vnext/lending-web:local .
docker build --platform=linux/amd64 -f infrastructure/containers/Dockerfile.admin-web -t vnext/admin-web:local .
docker build --platform=linux/amd64 -f infrastructure/containers/Dockerfile.lending-api -t vnext/lending-api:local .
docker build --platform=linux/amd64 -f infrastructure/containers/Dockerfile.integrations-api -t vnext/integrations-api:local .
```

The build stages compile the app and its workspace dependencies; the API images use pnpm's production deploy closure and run the real `dist/main.js` entrypoint as a non-root user. The frontend images copy each Vite app's own `dist/` output into non-root nginx. Both web images accept `API_UPSTREAM` at runtime (default `http://api:3000`) and proxy `/api/...` without stripping the `/api` prefix. Set that value to a reachable lending-api origin for the runtime network. The API images listen on port 3000 and their readiness health checks use the actual `/health/ready` route; the frontend health checks use nginx's `/healthz`. The repository currently has no committed `pnpm-lock.yaml`, so the build stage resolves dependencies with `pnpm install --no-frozen-lockfile`; add and commit the lockfile before relying on reproducible release images. SQL Server and application images must target Linux/amd64.

These image build contracts have not been exercised here: Docker is installed, but its Linux engine is unavailable, and package registry DNS is blocked. CI currently verifies workspace builds; it does not build or publish containers.

## Azure reference environment

`infrastructure/terraform/environments/reference` composes the SQL Server, Container Apps environment, four app resources, Key Vault, managed identity for archive writes, private archive storage, and monitoring. Set required Terraform input `api_upstream` to the private HTTP(S) origin for the lending API; Terraform passes it to both web containers as `API_UPSTREAM`, where nginx routes same-origin `/api` calls, and to integrations-api as `LENDING_API_BASE_URL`. The current AzureRM Key Vault argument is `rbac_authorization_enabled` ([provider resource reference](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/key_vault)). All app images must be immutable digests. SQL and archive network access default closed; a real environment needs private networking and an approved connectivity path before apps can use SQL or storage. Runtime identities should receive only their required database and storage permissions. The example archive identity has Blob Data Contributor scoped to the archive account.

Run `pnpm terraform:fmt:check` and `pnpm terraform:validate` for local static checks. Validation disables backend initialization and never plans or applies. Provider initialization requires registry access; if it is unavailable, report validation as blocked rather than passing. Azure authentication, Azure policy validation, and deployability have not been verified here.

Keep remote Terraform state with locking. Use distinct state keys and permissions for shared nonproduction, each PR preview, and production. Pass secret values through protected CI environment inputs or Key Vault; never commit `terraform.tfvars`, generated state, plan files, credentials, or connection strings. Terraform outputs marked sensitive still require careful handling by any consumer.

## CI, PR previews, and releases

`ci.yml` provides read-only pull request checks and does not need Azure credentials. Require the exact status checks `CI / quality`, `CI / migrations`, and `CI / terraform` in the `main` branch ruleset. Also require pull requests, at least one approving review, dismiss stale approvals after new commits, require CODEOWNERS review for protected paths, require conversation resolution, and disallow force pushes and branch deletion. The workflow installs with plain `pnpm install` because `pnpm-lock.yaml` is not committed yet; once it exists, switch every workflow install step to `pnpm install --frozen-lockfile` and enable lockfile-based caching.

The `CI / migrations` job starts an isolated SQL Server service, creates an empty database, applies the committed migrations, seeds synthetic data twice, and checks the schema manifest. Upgrade validation looks for `packages/db/test/fixtures/upgrade-from-prior.sql`. Add that fixture when a known prior schema is available; it must create the prior schema in the pre-created `VNextUpgrade` database, include Kysely's migration history through the prior migration, and may separate SQL batches with `GO` lines. The job applies all current migrations and runs the schema check against it. Until that fixture is committed, CI emits a notice and skips only the upgrade portion; empty-database migration validation still runs. `CI / quality` runs format, lint/boundaries, type checking, unit/component tests, workspace build, OpenAPI drift check, and the lending browser journey. Commit `docs/openapi.json` as the generated baseline for `pnpm api:check`.

The preview workflow builds all four applications and emits a deterministic PR scope (`pr-N`, database `VNextPreviewPRN`, resource group `rg-vnext-preview-pr-N`). It does not build/publish container images or create preview apps and databases yet; those steps need a registry, deployment identities, isolated SQL provisioning, and smoke-test orchestration. On PR close it can delete only that exact isolated resource group, and only when repository variable `AZURE_PREVIEW_CLEANUP_ENABLED=true` is set and the protected `preview-cleanup` environment is approved. Cleanup uses `pull_request_target` only for the close event, reads the numeric PR number, runs the trusted base-branch workflow, and never checks out or executes PR code. Configure `AZURE_PREVIEW_RESOURCE_GROUP_PREFIX=rg-vnext-preview` in that environment and set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets for an OIDC identity scoped to preview resources. Require reviewers and restrict the environment to the default branch. The identity must not have rights outside the dedicated preview resource group. Do not expose these credentials to PR build jobs or fork code. Retain a scheduled TTL sweep and inspect in-progress preview deployments because cancellation can interrupt orchestration even when the resource group delete is submitted asynchronously.

The release workflow updates an existing Container App with a full image reference pinned by SHA-256 digest; Azure CLI `update` fails if the named app is absent and creates no resources. It only accepts dispatches from `main`. Create a `production` environment with required reviewers, prevent self-review, and restrict deployments to `main`. Configure variables `AZURE_RESOURCE_GROUP`, `AZURE_APP_LENDING_WEB`, `AZURE_APP_ADMIN_WEB`, `AZURE_APP_LENDING_API`, and `AZURE_APP_INTEGRATIONS_API`, plus OIDC secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`. Scope its federated Azure credential to `repo:<ORG>/<REPO>:environment:production` with audience `api://AzureADTokenExchange` and grant update access only to the four existing Container Apps. Create a separate `production-migrations` environment with the same reviewer and branch rules; configure `AZURE_SQL_SERVER` and `AZURE_SQL_DATABASE` variables plus `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` secrets for a migration-only SQL principal. The migration checkbox is explicit and off by default. Run the additive migration before releasing an app that depends on it; otherwise confirm the compatible schema is already present. Production SQL must allow network access from the selected runner, or use an approved self-hosted runner in the private network. No secrets or Azure configuration are needed to run PR CI.

Enable dependency and security scanning on repository settings or through an approved workflow. Record per-app image digests and rollout revisions. Roll back an application to an image compatible with the current database schema.

## Archive delivery contract

The archive runner is a separate command using the backend image, started as a Container Apps job or local one-shot process. Its eventual command contract should accept a bounded batch size and time/event range, use managed identity for Blob Storage, and read durable SQL outbox/checkpoint state through a least-privilege database principal. It writes compressed event batches plus a checksum/manifest under stable event IDs, retries with backoff, and acknowledges outbox rows only after durable blob acknowledgement. Replaying the same batch must be safe. A crash between upload and checkpoint may create a duplicate blob, so deterministic batch names and manifests make replay verifiable. The SQL outbox schema exists, but the separate archive worker/job has not been implemented yet.

Do not purge SQL audit data until archive verification succeeds and an approved retention policy permits deletion. Keep all rows in SQL for the current runnable reference. The Terraform storage example enables versioning and soft delete but intentionally does not apply a locked immutability policy. Apply immutable retention only after recovery and replay tests and a separate review; no legal hold or real lock is configured by this repository.

Alert on oldest pending SQL outbox age, repeat failures, and archive delivery lag. The sample scheduled query detects application log markers but is not an outbox-age measurement; wire an authoritative metric or query to the pending-age data once the archive schema is in place. Telemetry is best effort and cannot replace the transactional audit record.

## Retention and monitoring

Terraform exposes workspace retention, table interactive retention, and total retention separately. Current examples default to 90 days interactive and 730 days total for operational tables; Application Insights is set to 90 days. Proposed audit retention is 365 days hot SQL target and at least seven years in Blob archive, subject to policy approval. Keep preview diagnostics in a separate workspace/resource policy with short configurable retention (for example, 14 days); do not try to vary retention by an environment column in one table. Azure Monitor/provider limits may require supported duration substitutions; confirm the actual table values after deployment. The current provider reference supports up to 730 days interactive and selected total retention values through 4383 days for workspace tables; Azure Monitor service capabilities may differ by table and API. Any higher approved duration requires validation against the chosen resource/API.

Configure alert routing in the protected environment with `alert_email_addresses`. It defaults empty and sends no notifications. The reference alert is disabled by default. Add alerts for API latency/error rate, restart loops, SQL/pool saturation, telemetry last-seen/ingestion gaps, diagnostic export failures if enabled, and archive lag. Sampling may reduce high-volume trace costs but never sample audit events. Daily ingestion caps can suppress diagnostics and require an explicit alert and runbook.

Cost review should track ingestion GB/day, sampling volume, retention GB-month, archive storage and operations, search-job retrieval, and per-PR infrastructure lifetime. No cost estimate or real alert destination is configured here.

## Investigation and example queries

Application logs should use structured JSON with allowlisted service, environment, release, request, trace/span, route template, duration, actor reference, and outcome fields. The backend instrumentation should initialize before application modules. Pick one authoritative application-log ingestion path (SDK exporter or container stdout collection) and avoid duplicate ingestion; container/platform diagnostics remain a separate source. Do not log secrets, raw SQL parameters, full sensitive URLs, or loan payloads. Telemetry outages must not block API operations.

The examples below assume structured fields are mapped into `AppTraces` custom dimensions. Adjust names to the actual exporter schema and test them in the target workspace.

```kusto
// Follow one request across services.
AppTraces
| where TimeGenerated > ago(24h)
| where tostring(Properties.requestId) == "<request-id>"
| project TimeGenerated, AppRoleName, Message, Properties.traceId, Properties.spanId
| order by TimeGenerated asc
```

```kusto
// Recent errors, with service and release dimensions.
AppExceptions
| where TimeGenerated > ago(24h)
| summarize failures=count() by AppRoleName, tostring(Properties.release), bin(TimeGenerated, 15m)
| order by TimeGenerated desc
```

```kusto
// Slow dependencies without exposing query parameters.
AppDependencies
| where TimeGenerated > ago(24h) and DurationMs > 1000
| project TimeGenerated, AppRoleName, Type, Target, Name, DurationMs, Success
| order by DurationMs desc
```

```kusto
// Compare errors around a release boundary.
AppRequests
| where TimeGenerated > ago(7d)
| summarize requests=count(), errors=countif(Success == false), p95=percentile(DurationMs, 95)
  by AppRoleName, tostring(Properties.release), bin(TimeGenerated, 1h)
| extend errorRate=100.0 * errors / requests
| order by TimeGenerated desc
```

For a historical incident, find the affected entity and time window through the audit API, record its stable event and trace IDs, then query telemetry by trace ID and request ID. If more context is required, restore a separately managed database backup to an isolated location and compare it with the audit event. Backups, audit history, and observability retention are separate systems; telemetry is not an audit source and a backup is not a searchable audit archive.

## Verification checklist

Before a production rollout, record the actual workspace and table interactive/total retention values, archive container policy and recovery test, identity role scopes, SQL network path, image digests, migration state, alert delivery test, and resource protection settings. Keep preview resources on a short lifecycle and production audit/monitoring storage outside PR cleanup state. Run Terraform validation and review a plan with the intended subscription/state before any approved deployment; this repository has not performed Azure validation or deployment.
