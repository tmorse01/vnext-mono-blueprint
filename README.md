# VNext Lending Platform Reference Monorepo

A clean-room, synthetic-data reference implementation for construction lending workflows. The implementation scope and acceptance criteria live in [the blueprint](docs/reference-blueprint.md); active ownership and integration order are tracked in the [implementation plan](docs/implementation-plan.md).

## Get started

Use Node.js 24.22.0 and pnpm 12.13.0. Run `pnpm install`, then `pnpm setup:local` to create local-only configuration, start SQL Server, apply migrations, seed synthetic records, and provision the local demo account. Start the four applications and their APIs together with `pnpm dev`. After setup, `pnpm dev` is the normal daily command.

The local services use these ports:

| Service | Port |
| --- | ---: |
| Lending web | 5173 |
| Admin web | 5174 |
| Lending API | 3001 |
| Integrations API | 3002 |
| SQL Server | 1433 |

See [operations](docs/operations.md) for Docker, native SQL Server, health checks, and shutdown guidance. `pnpm db:reset` is destructive and requires an explicit confirmation.

## Workspace boundaries

`apps/lending-web` and `apps/admin-web` are independently buildable React applications. `apps/lending-api` owns lending reads and writes; `apps/integrations-api` owns provider callbacks and idempotency state. Shared public schemas and endpoint definitions live in `packages/contracts`; `packages/api-client` validates network responses against those schemas. `packages/db` owns SQL Server types, migrations, and seed data. `packages/metadata` contains the closed metadata schema and safe rule evaluator, while `packages/ui` provides shared field and state components. `packages/server-platform` supplies common Express composition, context, authorization hooks, error handling, flags, logging, telemetry, and audit contracts.

pnpm workspaces keep package dependencies explicit and local packages linked. Turborepo runs build, lint, typecheck, test, and API generation tasks in dependency order and can reuse cache entries for deterministic work.

## Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm setup:local` | Initialize local config, database, migrations, seeds, and demo user |
| `pnpm dev` | Start the configured apps and APIs |
| `pnpm dev:lending-web` / `pnpm dev:admin-web` | Run one frontend after local setup |
| `pnpm dev:lending-api` / `pnpm dev:integrations-api` | Run one API with root `.env` loaded |
| `pnpm db:up` / `pnpm db:down` | Start or stop local SQL Server |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations or idempotently seed synthetic data |
| `pnpm db:reset -- --confirm` | Explicitly reset the local database |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Run repository checks |
| `pnpm build` | Build all applications and packages |

The main demos are scenario list filtering and editable loan assumptions with version-checked autosave, audit history, illustrative pricing, and metadata draft-preview-publish. These are being implemented in parallel; see the [implementation plan](docs/implementation-plan.md) for section status and validation limits.

This is an illustrative reference implementation, not a production lending system. Use synthetic data only; do not connect real customer data or provider credentials.
