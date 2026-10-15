# Implementation plan and parallel work

This is the captain's execution plan for implementing `reference-blueprint.md`. Each specialist owns its listed paths and reports completion to the captain before the section is treated as integrated. The captain owns cross-package contracts, root configuration, integration, and final validation.

## Workstreams

| Workstream | Owner | Scope | Status |
| --- | --- | --- | --- |
| Data foundation | `data_foundation` | `packages/db/**`, `docs/database.md`: SQL Server schema, migrations, types, schema drift check, synthetic idempotent seed | Complete; source reviewed, runtime validation pending |
| Backend platform | `backend_platform` | `packages/server-platform/**`, `docs/server-platform.md`: app composition, request context, auth/permission hooks, errors, flags, logs, telemetry, audit transaction contract | Complete; runtime validation pending |
| Delivery and operations | `delivery_ops` | `.github/**`, `infrastructure/**`, `tooling/scripts/terraform-validate.mjs`, `docs/operations.md` | Workflow/doc pass complete; provider/cloud checks remain |
| Lending API | `lending_api` | `apps/lending-api/**`, `apps/integrations-api/**`, `docs/api.md`: auth, scenarios, pricing, audit, metadata administration, provider idempotency | Complete; runtime checks and DB-principal provisioning pending |
| Lending web | `lending_web` | `apps/lending-web/**`, `packages/ui/**`, `docs/frontend.md`: auth, scenario list/detail, autosave, audit, shared UI | Complete; typecheck/build/tests await dependencies |
| Admin workflow | `admin_workflow` | `apps/admin-web/**`, `docs/admin.md`: metadata drafts, validation, preview, publish/revert, permissions, audit | Complete; runtime checks await dependencies |
| Container artifacts | `container_artifacts` | `infrastructure/containers/**`, focused operations documentation: deployable app images and same-origin API routing | Complete; builds await Docker engine and package registry access |
| Captain integration | `root` | Root manifests, contracts, API client, metadata rules, workspace scripts, architecture and contributor docs | In progress |

## Integration order

The data and platform foundations define the storage and request boundaries first. The API owns public endpoint behavior and the shared contracts; both web applications consume those endpoint definitions through the API client. Metadata settings remain limited to the server-owned field registry and closed rule schema. The captain resolves cross-workstream shape changes before they affect shared files.

Once the applications report completion, the captain will reconcile endpoint and DTO shapes, run boundary and formatting checks, attempt dependency installation and type checking, then run migrations, SQL Server integration tests, API/UI tests, and builds where the local runtime permits. Blocked checks will be recorded with the exact environment limitation rather than reported as passing.

## Blueprint items still being closed

- Four Linux/amd64 multi-stage app Dockerfiles now build workspace dependency closures, run APIs as non-root with real readiness checks, and serve frontends from non-root nginx with same-origin `/api` routing. CI does not yet build/publish these images or provision PR preview apps/databases. Terraform uses required `api_upstream` for web proxy routing and the integrations API's lending API connection. Docker builds cannot be verified until the engine and package registry are available.
- The database, platform, and delivery foundations are substantial, but several blueprint sections remain incomplete: durable audit archive worker and recovery tests; SDK-backed LaunchDarkly and browser/server telemetry startup; organization/person/loan/product-selection write paths and UI journeys; prior-schema migration fixture; SQL Server rollback/concurrency integration tests; reproducible OpenAPI baseline and frozen-lockfile workflow. These requirements must remain labeled partial until implemented and verified.
- The six initial specialists have completed their assigned implementation sections and reported changed paths, interfaces/routes, checks, and remaining gaps to the captain. The container worker also completed a follow-up build-artifact section. Runtime and dependency-blocked checks are tracked separately from source completion.

## Completion report

Each owner reports changed paths, exported interfaces or route shapes, migrations, checks attempted and their results, unresolved integration needs, and any incomplete requirements. A workstream is complete only after the captain has reviewed its files and recorded any follow-up needed for integration.

## Current environment constraints

The workspace was already an empty Git repository when implementation began. Its `.git` metadata is read-only in this environment, so branch renaming and creating the initial commit fail. Package registry DNS is unavailable, preventing pnpm installation and lockfile generation. The Docker CLI is installed, but the local Linux engine was stopped at implementation start. No cloud resources or external services are being provisioned.
