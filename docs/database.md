# Database package

The backend-only `@vnext/db` package owns the Kysely connection, SQL Server migrations, schema types, and synthetic development fixtures. It uses SQL Server with the built-in Kysely MSSQL dialect, Tedious, and Tarn. The first migration creates the `core`, `lending`, `config`, `iam`, `audit`, and `integrations` schemas. A follow-up migration adds scenario interest rate and term, construction project type, and DSCR monthly expenses as relational fields. Core lending data stays relational; JSON columns are limited to bounded metadata documents, product terms, revision snapshots, and pricing inputs/results.

## Local connection and commands

The construction project type column is required and backfills preexisting rows to `ground_up` so the additive migration can run safely; review legacy rows if their project type is known to differ. Scenario rate and term remain nullable for preexisting rows where the old schema did not preserve those values. New scenario writes and synthetic demo rows populate both.

Configure either `DB_URL` as `mssql://user:password@host:1433/database` or the separate variables `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. The URL is parsed locally and is never logged. Set `DB_ENCRYPT=false` only for an isolated local SQL Server; encryption defaults on and `DB_TRUST_SERVER_CERTIFICATE` defaults off. Timeout controls are `DB_CONNECT_TIMEOUT_MS` and `DB_REQUEST_TIMEOUT_MS`; pool size is `DB_POOL_MAX`. Do not commit real credentials. A developer can use a native SQL Server instance by pointing these settings at its host and database.

After the root workspace dependencies are installed, run:

```powershell
pnpm --filter @vnext/db build
pnpm --filter @vnext/db migrate
pnpm --filter @vnext/db seed
pnpm --filter @vnext/db schema:check
```

The workspace aliases are `pnpm db:migrate` and `pnpm db:seed`. Migrations use Kysely's migration table and lock, and are intended to run once as an explicit deployment step. APIs must not migrate independently during startup. Add schema changes as new timestamped migration modules and preserve all applied migration files. Seeds are separate from migrations and safe to run repeatedly. `schema:check` compares every expected table and column with SQL Server's catalog; it catches additions and removals that require a reviewed migration. It does not infer type or nullability changes, so migrations remain the type and constraint source of truth for this reference package.

Reset drops the current migration's six domain schemas. It refuses to run in production and requires `DB_ALLOW_RESET=true` in the environment in addition to the explicit reset command:

```powershell
$env:DB_ALLOW_RESET = 'true'
pnpm --filter @vnext/db reset
```

The seed uses synthetic example identities and loan values only. It intentionally creates no login account or usable password hash. Authentication setup should provision local credentials through its own safe development flow.

## Exact values and concurrency

Money and monthly expenses are stored as `decimal(19,4)`, ratios as `decimal(9,4)`, annual interest rates as fractional values in `decimal(9,6)` (for example, `0.082500` means 8.25%), and points as `decimal(9,4)`. Pass decimal values as normalized decimal strings. Never calculate a lending value through JavaScript `number`; use a decimal arithmetic library in the owning service and convert to a string at the SQL boundary. Tedious can materialize SQL DECIMAL values as JavaScript numbers, so queries that return values requiring exactness must cast those columns to `varchar` in SQL and validate the returned text before exposing it. The `DecimalString` type marks write-side precision-sensitive values; it cannot enforce a runtime format on its own.

SQL Server `rowversion` is used for scenario, metadata revision, and business-unit override optimistic concurrency. It is an opaque byte sequence, not a counter. Return it as a stable encoded token and include it in the update predicate; a zero-row update is a conflict. JSON values are stored as `nvarchar(max)` with `ISJSON` constraints. SQL Server/Tedious returns JSON columns as strings, so parse and validate them at the service boundary against the portable runtime schema before use.

## Runtime database permissions

Use separate SQL logins or managed identities for migrations, the lending API, the integrations API, and the archive worker. The migration identity owns schema changes and is not used by application processes. Grant only the required table operations to each runtime identity:

| Principal | Suggested access |
| --- | --- |
| Lending API | Read/write business tables, configuration, IAM/session state; `SELECT` and `INSERT` audit events; `INSERT` archive outbox rows. No audit update/delete. |
| Integrations API | Read/write `integrations.IntegrationDelivery`; execute a narrowly scoped internal API call for lending mutations. No direct access to lending tables. |
| Archive worker | Read audit events and pending outbox rows; update outbox delivery state only. No audit event mutation. |
| Migration job | DDL and migration-history access. Run as a separate deployment identity. |

These are deployment grants, not permissions to encode in the application login. Granting write to an entire schema is broader than this table-level policy and should be reviewed before production. Audit rows and their outbox records must be inserted in the same Kysely transaction as the business mutation. If audit persistence fails, the business transaction must fail too. Any unavoidable raw-SQL business mutation needs the same explicit audit/outbox transaction and code-owned redaction; database access alone does not create an audit record. SQL append-only grants reduce accidental changes but do not make the database tamper-proof.

## Table map

- `core`: business units, organizations, people, and explicit organization/person roles.
- `lending`: programs, products and versions, business-unit availability, loans and borrower links, scenarios with relational interest rate/term and revisions, construction/DSCR details including project type and monthly rent/expenses, and immutable illustrative pricing snapshots.
- `iam`: users, roles, permissions, role assignments, and opaque session-token hashes.
- `config`: versioned metadata documents, active publication pointers, and supported business-unit overrides. A publication uses `scopeKey='platform'` or `scopeKey='business-unit:<id>'` so SQL Server can enforce a non-null pointer key.
- `audit`: append-only events and durable archive-delivery state.
- `integrations`: provider idempotency key and delivery state, uniquely constrained per provider/key.

Business units provide configuration context and product availability, not record-level security isolation. Foreign keys and unique constraints establish core relationships. Scenario revision rows and pricing result snapshots preserve the state used when a scenario was edited or priced; product/pricing versions are not silently rewritten.

## Limits and extension points

The current schema is a synthetic reference model. Pricing is illustrative, archive storage is supplied by a separate worker, and there is no real provider integration. The initial migration is a clean baseline; production rollout still needs a tested prior-schema upgrade fixture, explicit SQL Server principal provisioning, backup/restore validation, and an archive retention/purge procedure before any hot audit history is removed.
