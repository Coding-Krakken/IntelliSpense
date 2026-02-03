# IntelliSpense

**AI-Native Business Operating System for Real-Time Profitability Intelligence**

[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

---

## What is IntelliSpense?

IntelliSpense eliminates Excel-based profitability tracking for project-based businesses. We provide **real-time financial intelligence** through:

- **Event-Sourced Financial Ledger:** Immutable, auditable financial history
- **Real-Time Profitability:** Know if you're making money *right now*, not weeks later
- **AI-Powered Insights:** Understand *why* margins changed and *what* to do about it
- **Deep Integrations:** Auto-sync from QuickBooks, time tracking, banking
- **Offline-First:** Full functionality without internet connection
- **Multi-Platform:** Web, desktop, mobile, CLI

### Target Users
- Solo operators & micro-businesses (1-5 employees)
- Small businesses (5-50 employees)
- Project managers (construction, professional services, agencies)
- Accountants and finance teams

---

## Quick Start

### Prerequisites

- Node.js ≥20.0.0
- pnpm ≥8.0.0
- Docker & Docker Compose
- PostgreSQL 15+ (via Docker)
- Redis 7+ (via Docker)

### Installation

```bash
# Clone the repository
git clone https://github.com/intellispense/intellispense.git
cd intellispense

# Install dependencies
pnpm install

# Start local services (PostgreSQL, Redis)
docker-compose up -d

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm db:migrate

# Seed database with initial data
pnpm db:seed

# Start development servers (API + Web)
pnpm dev
```

### Access Points

- **Web App:** http://localhost:3000
- **API:** http://localhost:4000
- **API Docs (Swagger):** http://localhost:4000/api/docs
- **GraphQL Playground:** http://localhost:4000/graphql
- **Prisma Studio:** `pnpm db:studio` → http://localhost:5555

---

## Architecture

IntelliSpense is built as a **monorepo** with shared TypeScript types across all platforms:

```
intellispense/
├── apps/
│   ├── api/          # NestJS backend (REST + GraphQL)
│   ├── web/          # Next.js web application
│   ├── desktop/      # Tauri desktop app (planned Phase 2)
│   ├── mobile/       # React Native (planned Phase 2)
│   ├── cli/          # oclif CLI (planned Phase 2)
│   └── worker/       # BullMQ background jobs
│
├── packages/
│   ├── core/         # Business logic (profitability, allocation)
│   ├── database/     # Prisma schema + migrations
│   ├── ui/           # Shared React components
│   ├── api-client/   # TypeScript API client
│   └── config/       # ESLint, TypeScript configs
│
└── docs/             # Design documents (VISION, PRINCIPLES, etc.)
```

**Key Design Decisions:**

- **Event-Sourced:** All financial data stored as immutable events
- **Offline-First:** Local SQLite/IndexedDB replicas, server as sync point
- **Multi-Tenant:** Row-level security with `organizationId` filtering
- **Type-Safe:** TypeScript everywhere, Zod validation, Prisma ORM

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

---

## Development

### Available Commands

```bash
# Development
pnpm dev                 # Start all apps in watch mode
pnpm build               # Build all apps and packages
pnpm lint                # Lint all code
pnpm format              # Format with Prettier
pnpm typecheck           # Type-check TypeScript

# Testing
pnpm test                # Run all tests
pnpm test:unit           # Unit tests only
pnpm test:integration    # Integration tests only
pnpm test:e2e            # End-to-end tests only

# Database
pnpm db:generate         # Generate Prisma Client
pnpm db:migrate          # Run migrations
pnpm db:seed             # Seed database
pnpm db:studio           # Open Prisma Studio

# Cleanup
pnpm clean               # Remove build artifacts and node_modules
```

### Project Structure

- **apps/api** - NestJS backend
  - REST endpoints (`/api/*`)
  - GraphQL API (`/graphql`)
  - WebSocket subscriptions
  - Background job workers

- **apps/web** - Next.js frontend
  - Server-Side Rendering (SSR)
  - Real-time updates via GraphQL subscriptions
  - Offline-first with IndexedDB

- **packages/core** - Business logic
  - Profitability calculations
  - Cost allocation algorithms
  - Validation schemas (Zod)
  - Pure TypeScript (no framework dependencies)

- **packages/database** - Database layer
  - Prisma schema
  - Migrations
  - Seed scripts
  - Type-safe database client

---

## Core Concepts

### Event-Sourced Financial Ledger

All financial data is stored as **immutable events**:

```typescript
// Financial events are append-only
const event: FinancialEvent = {
  eventType: 'LABOR_COST',
  amount: -150.00,       // Negative for costs
  timestamp: new Date(),
  projectId: 'project-123',
  sourceSystem: 'toggl',
  sourceId: 'timeentry-456'
}

// Corrections create new events (don't mutate original)
const correction = {
  ...originalEvent,
  correctsEventId: originalEvent.id,
  amount: -175.00,       // Corrected amount
  validFrom: new Date()
}
```

### Profitability Calculation

```typescript
// Simple, deterministic calculation
function calculateMargin(events: FinancialEvent[]) {
  const revenue = sum(events.filter(e => e.eventType === 'REVENUE'))
  const costs = sum(events.filter(e => e.eventType !== 'REVENUE'))
  return {
    revenue,
    costs,
    margin: revenue - costs,
    marginPercentage: (revenue - costs) / revenue * 100
  }
}
```

### Multi-Tenant Security

Every query automatically filtered by organization:

```typescript
// Prisma middleware ensures data isolation
prisma.$use(async (params, next) => {
  if (params.action === 'findMany') {
    params.args.where = {
      ...params.args.where,
      organizationId: currentUser.organizationId  // Auto-injected
    }
  }
  return next(params)
})
```

---

## Testing

### Test Structure

```bash
packages/core/
  ├── profitability.ts
  └── profitability.test.ts         # Unit tests (Vitest)

apps/api/
  ├── events/events.service.ts
  └── events/events.service.spec.ts # Integration tests (Testcontainers)

apps/web/
  └── e2e/profitability.spec.ts     # E2E tests (Playwright)
```

### Running Tests

```bash
# Unit tests (fast, no external dependencies)
pnpm test:unit

# Integration tests (real database via Docker)
pnpm test:integration

# E2E tests (full user flows, headless browser)
pnpm test:e2e

# All tests with coverage
pnpm test --coverage
```

**Coverage Targets:**
- `packages/core`: 100%
- `apps/api`: 90%
- `apps/web`: 70%
- Overall: 80%

---

## Deployment

### Local Development

```bash
docker-compose up -d    # PostgreSQL + Redis
pnpm dev               # API (port 4000) + Web (port 3000)
```

### Production (Digital Ocean)

```bash
# Via GitHub Actions (CI/CD)
git push origin main

# Manual deployment
pnpm build
docker build -t intellispense-api ./apps/api
docker build -t intellispense-web ./apps/web
```

See [deployment documentation](./docs/deployment.md) for details.

---

## Documentation

### For Developers

- [VISION.md](./VISION.md) - Problem statement, design philosophy
- [PRINCIPLES.md](./PRINCIPLES.md) - Architectural principles (P1-P10)
- [SYSTEM_MODEL.md](./SYSTEM_MODEL.md) - Data model, entities, relationships
- [WORKFLOWS.md](./WORKFLOWS.md) - Canonical user workflows
- [DEVELOPMENT_PLAYBOOK.md](./DEVELOPMENT_PLAYBOOK.md) - Patterns & anti-patterns
- [DECISION_LOG.md](./DECISION_LOG.md) - Why we chose this tech stack
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - Development roadmap

### For Users

- [Getting Started Guide](./docs/getting-started.md)
- [QuickBooks Integration Guide](./docs/integrations/quickbooks.md)
- [API Documentation](http://localhost:4000/api/docs)

---

## Contributing

### Development Workflow

1. Create feature branch from `main`
2. Write tests (TDD encouraged)
3. Implement feature
4. Run linters and tests locally
5. Open Pull Request
6. Code review (1 approval minimum)
7. CI pipeline passes (lint, test, build)
8. Merge to `main`

### Code Standards

- **TypeScript Strict Mode:** No `any` types
- **Zod Validation:** All API inputs validated
- **Immutability:** Financial events never mutated
- **Multi-Tenant:** All queries include `organizationId`
- **Tests Required:** Unit or integration tests for all logic

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## Security

### Reporting Vulnerabilities

**Do not open public issues for security vulnerabilities.**

Email: security@intellispense.com (PGP key available)

### Security Features

- **Authentication:** JWT with refresh token rotation
- **Authorization:** Role-Based Access Control (RBAC)
- **Encryption:** 
  - At-rest: AES-256 (PostgreSQL TDE)
  - In-transit: TLS 1.3
  - Client-side: SQLCipher (mobile/desktop)
- **Audit Logging:** All sensitive actions logged (7-year retention)
- **Multi-Tenancy:** Row-level security prevents data leakage

---

## License

Proprietary - All Rights Reserved

© 2026 IntelliSpense, Inc.

---

## Support

- **Documentation:** [docs.intellispense.com](https://docs.intellispense.com)
- **Email:** support@intellispense.com
- **Slack:** [community.intellispense.com](https://community.intellispense.com)
- **Status Page:** [status.intellispense.com](https://status.intellispense.com)

---

## Roadmap

### Phase 1: Real-Time Profitability Tracker ✅ (Current)
- Web app with offline support
- QuickBooks integration
- AI cost attribution
- Manual event entry

### Phase 2: Expansion (Q2 2026)
- Desktop app (Tauri)
- Mobile apps (iOS/Android)
- Additional integrations (Toggl, Harvest, Plaid)
- Advanced AI forecasting

### Phase 3: Full BOS (Q3 2026)
- Invoicing & payments
- Advanced reporting (PDF exports)
- Multi-currency support
- Team collaboration features

See [VISION.md](./VISION.md) for long-term vision.

---

**Built with ❤️ by the IntelliSpense Team**
