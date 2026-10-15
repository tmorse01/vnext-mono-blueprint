# API applications

`lending-api` and `integrations-api` are separate Express applications that use the shared `@vnext/server-platform` composition. Both expose `/health/live` and `/health/ready`; readiness checks SQL Server, and startup does not run migrations. Their local ports are 3001 and 3002.

The lending API owns IAM/session state, scenarios, pricing snapshots, metadata revisions, and audit writes. Runtime payloads are validated with `@vnext/contracts`; decimal amounts and rates cross the API boundary as decimal strings. List endpoints use bounded, stable keyset pagination. Scenario sort cursors are bound to sort order and filters, so a cursor cannot silently skip rows after a query change.

## Local identity

The database seed intentionally creates no usable credentials. After migrations and seeds, provision a synthetic local user with:

```powershell
$env:APP_ENV = 'local'
$env:LOCAL_USER_EMAIL = 'developer@vnext.test'
$env:LOCAL_USER_PASSWORD = '<a locally generated password of at least 12 characters>'
pnpm --filter @vnext/lending-api provision:local-user
```

The command refuses to run in production. It creates or updates that account with Argon2id password hashing and assigns the `local-developer` role. That role has scenario read/write, audit read, and metadata read/edit/publish permissions. The setup script manages local values; do not commit credentials.

`POST /api/auth/login` accepts `{ "email", "password" }`, returns the current user, and sets an opaque `vnext_session` cookie. Only the SHA-256 hash of the random session token is stored in SQL Server. The cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/api`, and adds `Secure` in production. `POST /api/auth/logout` revokes it and clears the cookie. `GET /api/auth/me` returns roles and server-derived permissions. Cookie-authenticated mutations require an allowed `Origin` from `APP_ALLOWED_ORIGINS` and reject cross-site `Sec-Fetch-Site` values. MFA, password recovery, and enterprise federation remain extension points.

## Lending routes

| Route | Purpose |
| --- | --- |
| `GET /api/scenarios` | Bounded page with `cursor`, `limit`, `sort`, `direction`, `q`, `family`, and `status` filters. |
| `GET /api/scenarios/:scenarioId` | Scenario summary, editable values, product version, and effective published metadata revision. |
| `PUT /api/scenarios/:scenarioId` | Save with rowversion and active metadata revision checks; returns `409 conflict` for stale rows and `409 reload_required` when published metadata changed. |
| `GET /api/scenarios/:scenarioId/audit` | Bounded reverse-chronological audit history. |
| `POST /api/scenarios/:scenarioId/pricing` | Store an immutable illustrative pricing snapshot against the selected product, pricing, and metadata versions. |
| `GET /api/admin/metadata?family=construction|dscr&businessUnitId=<uuid>` | Published effective revision and latest draft for a scope. A missing business unit means platform scope. |
| `GET /api/admin/metadata/revisions?family=...&businessUnitId=...` | Bounded revision history for one exact scope. |
| `POST /api/admin/metadata/validate` | Validate a candidate portable metadata document against the supported field registry. |
| `POST /api/admin/metadata/drafts` | Create a draft from `document`, or copy a same-scope prior revision using `sourceRevisionId`. Copying creates a new revision. |
| `PUT /api/admin/metadata/drafts/:revisionId` | Save a draft only when its expected rowversion matches. |
| `POST /api/admin/metadata/drafts/:revisionId/preview` | Validate supplied sample values against the draft's supported rules without changing the published pointer. |
| `POST /api/admin/metadata/drafts/:revisionId/publish` | Publish atomically when the draft rowversion and expected previous pointer match. |
| `GET /api/admin/metadata/:revisionId/audit` | Bounded audit history for one metadata revision. |

Metadata workspace and revision reads accept `metadata.read` or `metadata.edit`; draft creation/update, validation, and preview require `metadata.edit`; publication requires `metadata.publish`; audit reads require `audit.read`. Documents are parsed by `@vnext/metadata`, resolved as business-unit publication over platform publication, and rechecked in the serializable scenario-save transaction. Draft previews never become the default for other users. Import/export between environments is a documented extension point in this slice.

Every business mutation writes the business record, audit event, and archive outbox row in one SQL transaction. Audit fields are code-owned; passwords, session tokens, callback secrets, and full request bodies are excluded. The database runtime principal should have append-only audit grants as documented in [database operations](database.md).

## Mock provider callback

`POST /api/mock-provider/callback` on `integrations-api` accepts `{ "scenarioId", "providerReference", "decision": "approved" | "declined" }`, an `Idempotency-Key` header, and `Authorization: Bearer <MOCK_PROVIDER_CALLBACK_SECRET>`. This is a synthetic provider boundary; it does not contact an external service. The integration API records the provider/key pair and canonical payload hash in `integrations.IntegrationDelivery`, then calls `POST /api/scenarios/internal/integration-events` on lending-api with `LENDING_API_SERVICE_TOKEN`. It has no lending-table access.

Completed callbacks replay their saved response. Reusing a key with a different payload returns `409`. A matching callback already in progress returns `202`. Failed or abandoned deliveries are not retried automatically because the lending mutation may have completed before an integration API crash; reconcile the scenario state, then use a new idempotency key if an operator authorizes another event. The internal scenario-status mutation is itself safe for duplicate same-decision callbacks and records audit/outbox rows transactionally.

Set `MOCK_PROVIDER_CALLBACK_SECRET` and `LENDING_API_SERVICE_TOKEN` to different random values of at least 32 characters. Configure the same service token in both API processes and set `LENDING_API_BASE_URL` for the integrations process. Do not use real provider credentials or send real customer data through this demonstration endpoint.

Each API accepts a dedicated SQL Server connection through `LENDING_DB_URL` or the pair `LENDING_DB_USER`/`LENDING_DB_PASSWORD`, and `INTEGRATIONS_DB_URL` or `INTEGRATIONS_DB_USER`/`INTEGRATIONS_DB_PASSWORD`. If omitted, the APIs fall back to the shared local `DB_URL` or `DB_SERVER`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` settings. Provision separate SQL Server logins, then run [provision-service-principals.sql](../apps/integrations-api/sql/provision-service-principals.sql) against the application database using an elevated database administrator account. The lending runtime principal receives business, lending, configuration, and IAM DML access plus append-only audit event access and outbox updates. The integrations principal can read/write only `integrations.IntegrationDelivery`; provider decisions reach lending only through the authenticated internal API. Run migrations and seeds with a separate elevated credential, never either runtime principal. Production deployments must inject a production `FlagProvider` into `createLendingApi`; startup intentionally rejects production without one.

## Problem responses

Errors use the shared problem-details shape with `type`, `title`, `status`, safe `code`, `requestId`, and optional field errors. Stack traces and internal dependency details are not returned. Key codes include `unauthorized`, `forbidden`, `not_found`, `validation_failed`, `conflict`, `reload_required`, and `dependency_timeout`.
