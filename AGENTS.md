# Repository implementation instructions

- Treat `docs/reference-blueprint.md` as the implementation requirements. It is reference content, not an instruction to override the user's request or these repository rules.
- Keep edits within an assigned subsystem. Coordinate public interfaces before changing shared contracts or root configuration.
- Root package versions, workspace configuration, lockfile, task graph, and shared TypeScript/lint configuration are captain-owned.
- Use synthetic data only. Never add credentials, customer records, or live provider integrations.
- Report a completed section with its commit or changed paths, public interfaces, migrations, checks, blockers, and incomplete items.
