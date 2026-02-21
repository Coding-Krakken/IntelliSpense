Running the minimal reference stack

This repository now includes a tiny runnable reference stack (minimal API + web) for local development and smoke-testing.

Prereqs:
- Docker & Docker Compose (for `docker-compose.dev.yml`)
- Node.js >= 20, pnpm

Quickstart:

1. Start local services (Postgres + Redis):

```bash
docker-compose -f docker-compose.dev.yml up -d
```

2. Install dependencies (from repo root):

```bash
pnpm install
```

3. Start the dev servers (Turbo will run package dev scripts):

```bash
pnpm dev
```

4. Open in your browser:
- Web UI: http://localhost:3000
- API health: http://localhost:4000/api/health
- Profitability demo: http://localhost:4000/api/profitability

Notes:
- This scaffold is intentionally minimal: it provides health endpoints and a simple demo profitability endpoint used by the web UI. Use it as a smoke environment while we implement the full API and frontend.
