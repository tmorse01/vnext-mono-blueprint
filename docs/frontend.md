# Lending frontend

`apps/lending-web` is the browser application for scenario review and editing. It uses React Router for feature routes, TanStack Query for cancellable server reads, TanStack Form for editable values, and MUI/MUI X Community for layout, metadata fields, and the editable scenario table. `packages/ui` owns the shared theme, metadata field adapter, and standard loading, empty, error, and conflict states.

The route shell checks `/api/auth/me` and shows a sign-in screen when there is no valid session. Login and logout use the server-side session cookie; the browser never stores a password or bearer token. Local setup creates a synthetic developer account using `LOCAL_USER_EMAIL`, generates a local-only password, and prints that password once in the setup terminal. Only `VITE_LOCAL_USER_EMAIL` may be prefetched into the sign-in form.

## Screens and behavior

- `/scenarios` shows a server-paginated table. Search, family, status, sorting, direction, and opaque cursor history are stored in URL search parameters. Named filter views are stored locally in the browser. Loan amount can be edited in the table; the app first reads the current edit document and then submits a version-checked full update.
- `/scenarios/:scenarioId` uses the effective metadata revision when supplied by the API, merged over the code-owned Construction or DSCR registry. Core fields share one layout, while product-family details have separate sections. Valid edits autosave after a short debounce through a per-record serial queue.
- `/scenarios/:scenarioId/audit` reads a bounded page of immutable history with actor, time, action, request reference, and field changes.

Every save carries `expectedVersion` and the metadata revision ID. A 409 stops the queue and preserves current form values; the page offers a reload action so a user can inspect the latest record and manually reapply edits. Failed writes retain dirty values and can be retried explicitly. The before-unload prompt protects pending changes. Client-side metadata checks are convenience only; the API remains authoritative.

## Local data and checks

Set `VITE_USE_MOCKS=true` for deterministic synthetic MSW fixtures when running the app in isolation. Without that setting, the app uses same-origin `/api` routes. UI tests run with `pnpm --filter @vnext/lending-web test`; the browser journey uses `pnpm --filter @vnext/lending-web test:e2e` and intercepts the auth and scenario API for the test journey. Vite serves the lending app on port 5173.
