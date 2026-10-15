# Architecture overview

The workspace contains four deployable applications with shared, versioned-in-repository packages. Workspace boundaries separate business ownership and runtime responsibilities while allowing one reviewed change to update a database migration, API contract, and consuming UI together.

## Dependency direction

```mermaid
flowchart LR
  subgraph apps[Deployable applications]
    LW[lending-web]
    AW[admin-web]
    LA[lending-api]
    IA[integrations-api]
  end
  subgraph shared[Shared packages]
    C[contracts]
    AC[api-client]
    UI[ui]
    M[metadata]
    SP[server-platform]
    DB[db]
  end
  LW --> AC
  LW --> C
  LW --> UI
  AW --> AC
  AW --> C
  AW --> UI
  UI --> M
  C --> M
  AC --> C
  LA --> C
  LA --> SP
  LA --> DB
  LA --> M
  IA --> C
  IA --> SP
  IA --> DB
  IA -. narrow service call .-> LA
```

The integrations API stores provider idempotency state in its own schema. It asks the lending API to perform lending writes through a narrow service identity and does not import lending repositories. Public DTOs are defined once in `packages/contracts`; browser code reaches them through `packages/api-client`.

## Domain model

```mermaid
erDiagram
  BUSINESS_UNIT ||--o{ LOAN : scopes
  BUSINESS_UNIT }o--o{ LOAN_PRODUCT : enables
  ORGANIZATION ||--o{ ORGANIZATION_PERSON : associates
  PERSON ||--o{ ORGANIZATION_PERSON : associates
  LOAN ||--o{ LOAN_ORGANIZATION : has_borrower
  ORGANIZATION ||--o{ LOAN_ORGANIZATION : participates
  LOAN ||--o{ LOAN_SCENARIO : contains
  LOAN_PRODUCT ||--o{ PRODUCT_VERSION : versions
  PRODUCT_VERSION ||--o{ LOAN_SCENARIO : selects
  LOAN_SCENARIO ||--o| CONSTRUCTION_DETAIL : construction
  LOAN_SCENARIO ||--o| DSCR_DETAIL : dscr
  LOAN_SCENARIO ||--o{ SCENARIO_REVISION : snapshots
  LOAN_SCENARIO ||--o{ PRICING_RESULT : prices
  PRICING_VERSION ||--o{ PRICING_RESULT : calculates
  METADATA_REVISION ||--o{ METADATA_PUBLICATION : publishes
  USER ||--o{ USER_SESSION : authenticates
  USER }o--o{ ROLE : assigned
  ROLE }o--o{ PERMISSION : grants
  AUDIT_EVENT ||--o| ARCHIVE_OUTBOX : delivers
```

Core lending values use typed relational columns and decimal arithmetic. Metadata documents and bounded pricing/scenario snapshots use validated JSON; those documents do not define arbitrary columns or SQL. The table and constraint definitions live in `packages/db/src/migrations`.

## Request paths

```mermaid
sequenceDiagram
  participant Browser
  participant API as Lending API
  participant Platform as server-platform
  participant Repo as Feature repository
  participant SQL as SQL Server
  Browser->>API: Contract-validated HTTP request
  API->>Platform: request context, identity, permission
  API->>Repo: feature service operation
  Repo->>SQL: parameterized query / transaction
  SQL-->>Repo: rows and versions
  Repo-->>API: domain result
  API-->>Browser: mapped DTO or problem details
```

Scenario writes use an expected row version and write the scenario, audit event, and archive outbox entry in one SQL transaction. A stale version returns a conflict and leaves the caller's changes available for recovery. Telemetry is best-effort and does not participate in that transaction.
