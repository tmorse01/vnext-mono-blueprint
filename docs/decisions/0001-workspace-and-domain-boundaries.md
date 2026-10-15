# ADR 0001: Shared workspace with explicit service boundaries

- Status: accepted for the reference implementation
- Date: 2026-10-14

## Context

The platform needs four independently buildable and deployable applications, but API contracts, metadata rules, and shared UI behavior must stay aligned during fast feature development. Lending data and third-party delivery state also have different ownership and authorization requirements.

## Decision

Use pnpm workspaces and Turborepo in one monorepo. Keep four deployable applications under `apps/` and small, purpose-specific shared packages under `packages/`. The lending API owns lending reads and writes. The integrations API owns callback validation and idempotency records, then calls the lending API with a narrow service identity. Runtime DTOs are defined in shared Zod contracts; feature repositories remain local to the service that owns their tables.

Store loan fields in relational SQL Server columns with explicit decimal precision and foreign keys. Use validated, bounded JSON for metadata documents and immutable snapshots. Metadata administrators can configure only known fields and closed conditional rules; database mappings and new domain columns remain developer-controlled.

Every business mutation and its audit event/archive outbox record commit together. Scenario and metadata edits use optimistic concurrency. Telemetry is diagnostic and cannot replace the audit store.

## Consequences

One pull request can update a migration, API contract, server, and UI together, while each application retains its own entry point, build artifact, and deployment workflow. Shared packages must keep their public exports narrow and changes to contracts require consumer checks. The integration service cannot bypass lending authorization by opening lending tables directly.

## Revisit when

An application needs independent release governance or scaling that cannot be served by its current deployment boundary, or a shared package accumulates unrelated responsibilities. Do not split services solely to mirror folder names.
