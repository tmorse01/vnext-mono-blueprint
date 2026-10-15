# Configuration Studio

`@vnext/admin-web` is the browser app for reviewing and editing versioned product metadata. It runs on port `5174`, uses the shared MUI theme and `MetadataField` renderer from `@vnext/ui`, and proxies `/api` to the local lending API on port `3001`. The dev server reads the root `.env`; it does not expose local passwords to the browser.

The page gets the signed-in actor and permissions from `/api/auth/me`. When the session is missing, it shows a sign-in form backed by `/api/auth/login`; successful login refreshes the shared current-user query. Server permissions remain authoritative. Draft edits, validation, preview, and revert are disabled without `metadata.edit`; publishing is disabled without `metadata.publish`; audit events require `audit.read`.

The workspace is scoped by product family and an optional business unit. The environment is displayed from the API response and is selected by the running API deployment. Draft and published revision data comes from `GET /api/admin/metadata?family=…&businessUnitId=…`; revision history comes from `GET /api/admin/metadata/revisions`. Creating or reverting to an older version uses `POST /api/admin/metadata/drafts`; updates send the captured expected version with `PUT /api/admin/metadata/drafts/:revisionId`. The app validates through `/api/admin/metadata/validate`, previews through `/api/admin/metadata/drafts/:revisionId/preview`, and publishes with both the expected draft version and currently published revision ID. Audit history is loaded per revision from `/api/admin/metadata/:revisionId/audit`.

The editor exposes the shared closed schema: stable known field keys, labels, descriptions, groups, order, supported widgets, required state, default values, numeric and length constraints, select options, safe visibility conditions, table columns, filterability, and form layout. It checks the document schema and field registry locally for fast feedback, then asks the API to validate before publishing. Preview uses the shared field adapter and safe condition evaluator with synthetic values; it remains scoped to the selected draft revision. A stale write returns a visible conflict message, preserves the in-memory edits, and offers an explicit reload action.

Export downloads a portable JSON envelope containing the format version, product family, and metadata document. It deliberately omits environment, business-unit/database identifiers, revision IDs, and actor data. Import loads that document into the currently selected environment and scope as an unsaved draft, then checks the shared schema, field registry, and target API validation before it can be saved. A product-family mismatch is shown as a compatibility issue and blocks saving until the user changes scope or re-imports a compatible document.

To run and test the app after installing workspace dependencies:

```powershell
pnpm --filter @vnext/admin-web dev
pnpm --filter @vnext/admin-web test
pnpm --filter @vnext/admin-web typecheck
```

Set `VITE_USE_MOCKS=true` in the root `.env` for the synthetic MSW flow. Mock users and sample metadata are test fixtures only. The app does not connect to external providers or deploy infrastructure.
