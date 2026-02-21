Title: Scaffold minimal reference stack (API + Web) + Prisma wiring

Summary:
- Adds a minimal `apps/api` Express server and `apps/web` demo server to provide a runnable reference stack for smoke testing.
- Adds `docker-compose.dev.yml` to provide local Postgres and Redis for integration tests.
- Wires the API's `/api/profitability` endpoint to the existing `@intellispense/database` Prisma client, with a safe fallback when the DB is not initialized.
- Adds `TEARDOWN.md` with a teardown assessment and prioritized remediation steps.

Why:
- Provide a reproducible local environment and a concrete baseline to iterate on the API and frontend without blocking on missing artifacts.

Files added/changed:
- TEARDOWN.md
- apps/api/* (package.json, tsconfig.json, src/index.ts)
- apps/web/* (package.json, tsconfig.json, src/index.ts)
- docker-compose.dev.yml
- dev/README.md

How to run locally:
1. Start DB & Redis: `docker-compose -f docker-compose.dev.yml up -d`
2. Install: `pnpm install`
3. Start dev servers: `pnpm dev`
4. Visit http://localhost:3000 and http://localhost:4000/api/health

Notes and next steps:
- This is intentionally minimal; next work should integrate authentication, proper health checks, and expand the API surface to implement documented workflows.
