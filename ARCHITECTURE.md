# IntelliSpense Architecture

**Last Updated:** February 3, 2026  
**Status:** Implementation Blueprint  
**Owner:** Engineering Team

---

## Executive Summary

IntelliSpense is an **event-sourced, offline-first, multi-tenant Business Operating System** that provides real-time profitability intelligence for project-based businesses. This document describes the system architecture for Phase 1: Real-Time Profitability Tracker.

**Core Design Principles:**
1. **Event-Sourced Financial Ledger:** Immutable FinancialEvent table as source of truth
2. **Offline-First Architecture:** Local SQLite/IndexedDB replicas, server as sync coordinator
3. **Multi-Tenant by Default:** Row-level security with organizationId filtering
4. **API-First:** All platforms consume same REST/GraphQL endpoints
5. **Real-Time Updates:** WebSocket subscriptions for live profitability changes
6. **AI-Augmented:** Anthropic Claude for cost attribution and explanations (human-approved)

---

## System Context

### Users & Platforms

```
┌─────────────────────────────────────────────────────────────┐
│                         Users                                │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Solo Operator│ Small Business│ Project      │ Accountant/   │
│              │ Owner        │ Manager      │ Executive     │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────┐
│  Web App    │ │ Desktop App │ │  Mobile Apps │ │  CLI     │
│  (Next.js)  │ │  (Tauri)    │ │ (React Native)│ │ (Node.js)│
│             │ │             │ │  iOS/Android │ │          │
│  IndexedDB  │ │  SQLite     │ │  SQLite      │ │ Scripts  │
└──────┬──────┘ └──────┬──────┘ └───────┬──────┘ └────┬─────┘
       │               │                │             │
       └───────────────┴────────────────┴─────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │   API Gateway        │
            │  (NestJS REST + GQL) │
            └──────────┬───────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌────────────┐ ┌──────────────┐ ┌────────────┐
│ PostgreSQL │ │    Redis     │ │  BullMQ    │
│  Primary   │ │ Cache + Queue│ │  Workers   │
└────────────┘ └──────────────┘ └────────────┘
       │
       ▼
┌────────────┐ ┌──────────────┐ ┌────────────┐
│ QuickBooks │ │ Anthropic    │ │ DO Spaces  │
│ Integration│ │ Claude API   │ │ (S3-compat)│
└────────────┘ └──────────────┘ └────────────┘
```

---

## Application Architecture

### Monorepo Structure

```
intellispense/
├── apps/
│   ├── api/              # NestJS backend (REST + GraphQL)
│   ├── web/              # Next.js web application
│   ├── desktop/          # Tauri desktop app (Rust + webview)
│   ├── mobile/           # React Native (iOS + Android)
│   ├── cli/              # oclif CLI tool
│   └── worker/           # BullMQ background job processor
│
├── packages/
│   ├── core/             # Business logic (pure TypeScript)
│   │   ├── profitability/
│   │   ├── allocation/
│   │   └── validation/
│   ├── database/         # Prisma schema + client
│   ├── sync/             # Offline-first sync engine
│   ├── ui/               # Shared React components
│   ├── api-client/       # TypeScript API client
│   └── config/           # Shared configs (ESLint, TS, etc.)
│
├── docs/                 # Design documents (VISION, PRINCIPLES, etc.)
│
├── infrastructure/       # Docker, K8s, Terraform (future)
│
├── scripts/              # Automation scripts
│
└── turbo.json            # Turborepo build pipeline
```

**Why monorepo:**
- Share types across all platforms (TypeScript everywhere)
- Atomic changes (modify data model → all apps updated in one PR)
- Single version (simplifies releases)
- Consistent tooling (same ESLint, Prettier, tests)

**Tool:** Turborepo with pnpm workspaces

---

## Data Architecture

### Event-Sourced Financial Ledger

**Core Principle:** Financial events are immutable. All profitability calculations derive from events.

```
┌──────────────────────────────────────────────────────────┐
│              FinancialEvent (Immutable)                   │
├──────────────────────────────────────────────────────────┤
│ id, organizationId, eventType, amount, timestamp,        │
│ projectId, sourceSystem, sourceId, validFrom, validTo    │
└────────────┬─────────────────────────────────────────────┘
             │
             ├─► REVENUE          (invoices, payments)
             ├─► LABOR_COST       (timesheets × rates)
             ├─► MATERIAL_COST    (bills, purchases)
             ├─► OVERHEAD_COST    (rent, software, allocated)
             ├─► EQUIPMENT_COST   (tool rentals, machinery)
             ├─► SUBCONTRACTOR_COST
             ├─► ADJUSTMENT       (corrections, references original)
             └─► FORECAST         (AI predictions)

┌──────────────────────────────────────────────────────────┐
│     ProjectProfitabilitySnapshot (Materialized View)     │
├──────────────────────────────────────────────────────────┤
│ Cached calculation results, invalidated on new events    │
│ projectId, asOfDate, totalRevenue, totalCosts, margin    │
└──────────────────────────────────────────────────────────┘
```

**Temporal Queries:**
- Query profitability "as of January 15, 2026" using `validFrom`/`validTo`
- Corrections create new events with `correctsEventId` reference
- Original events preserved (immutable audit trail)

**Event Flow:**
```
External Source → Integration Connector → Validation → Deduplication
                                              ↓
                                    FinancialEvent (append-only)
                                              ↓
                           ┌──────────────────┴───────────────────┐
                           ▼                                      ▼
                  Invalidate Cache                        Publish Event (Redis)
                           ↓                                      ▼
              Recalculate Profitability              WebSocket → All Clients
                           ▼
                  Update Snapshot Cache
```

---

## Core Modules

### 1. Authentication & Authorization

**Stack:**
- JWT (access tokens: 15 min expiry, refresh tokens: 30 days)
- Bcrypt password hashing (cost factor 12)
- MFA via TOTP (optional for users, required for owners/admins)
- SSO via SAML 2.0 / OIDC (future)

**Multi-Tenant Security:**
- Every query filtered by `organizationId` (from JWT claims)
- Prisma middleware auto-injects org filter
- Row-level security enforced at ORM level
- Database views prevent direct table access

**Permissions Model (RBAC):**
```typescript
enum Role {
  OWNER      // Full access
  ADMIN      // Manage users, integrations, settings
  PROJECT_MANAGER  // Create projects, events
  ACCOUNTANT // View all financials, create events
  VIEWER     // Read-only access
}

// Granular permissions
interface Permission {
  resource: 'projects' | 'events' | 'integrations' | 'users' | 'settings'
  action: 'read' | 'write' | 'delete' | 'manage'
  scope?: string  // Optional project-specific permission
}
```

**Implementation:**
- NestJS Guards for endpoint protection
- Custom decorators: `@RequirePermission('events:write')`
- Audit log for all auth events

---

### 2. Event Ingestion Pipeline

**Sources:**
1. **Manual Entry** (Web/Mobile/Desktop UI)
2. **QuickBooks Online** (invoices, bills, journal entries)
3. **Time Tracking** (Toggl, Harvest - planned)
4. **Banking** (Plaid - planned)
5. **Payroll** (Gusto, ADP - planned)

**Ingestion Flow:**
```typescript
// Pseudocode
async function ingestEvent(source: ExternalSource, rawData: any) {
  // 1. Transform external format → FinancialEvent
  const event = transform(rawData)
  
  // 2. Validate with Zod schema
  const validated = FinancialEventSchema.parse(event)
  
  // 3. Check idempotency (sourceSystem + sourceId)
  const exists = await findBySourceId(validated.sourceSystem, validated.sourceId)
  if (exists) return { skipped: true }
  
  // 4. Persist to database
  const created = await prisma.financialEvent.create({ data: validated })
  
  // 5. Publish to Redis (real-time updates)
  await redis.publish('financial-events', JSON.stringify(created))
  
  // 6. Queue profitability recalculation
  await queue.add('recalc-profitability', { projectId: created.projectId })
  
  return { created }
}
```

**Deduplication Strategy:**
- Unique constraint: `(organizationId, sourceSystem, sourceId)`
- Idempotent inserts (re-ingesting same data is safe)
- SyncLog tracks which external records already processed

---

### 3. Profitability Calculation Engine

**Location:** `packages/core/profitability.ts` (pure business logic)

**Algorithm:**
```typescript
export function calculateMargin(events: FinancialEvent[]): ProfitabilityResult {
  const revenue = sum(events.filter(e => e.eventType === 'REVENUE'))
  
  const costs = {
    labor: sum(events.filter(e => e.eventType === 'LABOR_COST')),
    materials: sum(events.filter(e => e.eventType === 'MATERIAL_COST')),
    overhead: sum(events.filter(e => e.eventType === 'OVERHEAD_COST')),
    equipment: sum(events.filter(e => e.eventType === 'EQUIPMENT_COST')),
    subcontractors: sum(events.filter(e => e.eventType === 'SUBCONTRACTOR_COST'))
  }
  
  const totalCosts = Object.values(costs).reduce((sum, c) => sum + Math.abs(c), 0)
  const margin = revenue - totalCosts
  const marginPercentage = revenue > 0 ? (margin / revenue) * 100 : null
  
  return { revenue, costs, margin, marginPercentage }
}
```

**Caching Strategy:**
```
┌──────────────────────────────────────────────────┐
│ Level 1: Redis Cache (TTL: 1 hour)              │
│ Key: profitability:{projectId}:{asOfDate}        │
│ Invalidated on: New event for projectId         │
└──────────────────────────────────────────────────┘
                       ↓ (cache miss)
┌──────────────────────────────────────────────────┐
│ Level 2: ProfitabilitySnapshot Table            │
│ Pre-computed snapshots (daily, weekly, monthly)  │
│ Updated async via background worker             │
└──────────────────────────────────────────────────┘
                       ↓ (snapshot stale)
┌──────────────────────────────────────────────────┐
│ Level 3: Real-time Calculation from Events      │
│ Query FinancialEvent table, compute on-the-fly  │
│ Store result in cache for next request          │
└──────────────────────────────────────────────────┘
```

**Performance Targets:**
- P95: <300ms (from cache)
- P99: <500ms (from database)
- Cache hit rate: >90%

---

### 4. AI Integration (Anthropic Claude)

**Use Cases:**
1. **Cost Attribution:** Allocate overhead across projects
2. **Margin Explanations:** "Why did profitability drop 5%?"
3. **Forecasting:** Predict final project margin
4. **Anomaly Detection:** Flag unusual costs

**Architecture:**
```
User Action → AI Request → AIDecision Table (log input)
                                ↓
                        Call Anthropic API (Claude Opus/Sonnet)
                                ↓
                        Parse & Validate Response
                                ↓
                        Store Output in AIDecision
                                ↓
                        Present to User for Approval
                                ↓
                (User Approves) → Create FinancialEvents with aiDecisionId
                (User Rejects)  → No action, log rejection
                (User Modifies) → Apply adjusted values, log modification
```

**Trace & Learn:**
- Every AI call logged: `input`, `output`, `model`, `timestamp`
- User feedback captured: `userReview`, `userFeedback`
- Corrections improve future prompts (learning loop)

**Example:**
```typescript
// Cost attribution
const aiSuggestion = await ai.attributeOverhead({
  costCenterId,
  amount: 5000,
  projects: activeProjects
})

const decisionId = await prisma.aiDecision.create({
  data: {
    decisionType: 'COST_ATTRIBUTION',
    inputContext: { costCenterId, amount, projects },
    output: aiSuggestion,
    modelVersion: 'claude-3-opus-20240229',
    confidence: aiSuggestion.confidence,
    userReview: 'PENDING'
  }
})

// Present to user in UI
return { decisionId, suggestion: aiSuggestion }
```

---

## Offline-First Sync Architecture

### Local Storage

**Desktop/Mobile:** SQLite with SQLCipher encryption  
**Web:** IndexedDB with Dexie.js

**Schema Replication:**
- Subset of server schema (user's organization data only)
- Same table structure as PostgreSQL (Prisma generates both schemas)
- Additional columns: `_syncStatus`, `_pendingOp`, `_localId`

### Sync Protocol

**Hybrid Logical Clocks (HLC):**
- Combines timestamp + logical counter
- Resolves conflicts via timestamp comparison
- Last-write-wins for mutable entities (Projects, Users)
- Append-only for immutable entities (FinancialEvents)

**Sync Flow:**
```
┌─────────────┐                           ┌─────────────┐
│   Client    │                           │   Server    │
└─────────────┘                           └─────────────┘
       │                                          │
       │  1. Push local changes                  │
       ├─────────────────────────────────────────►│
       │  POST /api/sync/push                    │
       │  { operations: [...], lastSync: ts }    │
       │                                          ├─► Validate
       │                                          ├─► Apply changes
       │                                          ├─► Detect conflicts
       │                                          │
       │  2. Receive server response              │
       │◄─────────────────────────────────────────┤
       │  { applied: [...], conflicts: [...],    │
       │    serverChanges: [...], newSync: ts }  │
       ├─► Apply server changes                  │
       ├─► Resolve conflicts                     │
       ├─► Recalculate profitability             │
       │                                          │
       │  3. Establish WebSocket (when online)   │
       ├─────────────────────────────────────────►│
       │  ws://api/subscriptions                 │
       ├───────────────────────────────────────►  │
       │  Subscribe to profitability updates     │
       │                                          │
       │  4. Real-time events                    │
       │◄─────────────────────────────────────────┤
       │  { event: {...}, profitability: {...} } │
       │                                          │
```

**Conflict Resolution:**
- **Events (immutable):** No conflicts (append-only)
- **Projects/Tasks (mutable):** Last-write-wins based on `updatedAt` timestamp
- **Rare conflicts:** User notified, can choose version

---

## Real-Time Updates

### WebSocket Architecture

**Server:** Apollo GraphQL Server with subscriptions  
**Transport:** WebSocket (fallback to long polling)  
**PubSub:** Redis (mediates between API servers)

```typescript
// GraphQL Subscription
subscription ProfitabilityUpdated($projectId: ID!) {
  profitabilityUpdated(projectId: $projectId) {
    projectId
    margin
    marginPercentage
    revenue
    costs {
      labor
      materials
      overhead
    }
    lastUpdated
  }
}
```

**Update Flow:**
```
User A creates event → API Server 1
                            ↓
                    Insert into PostgreSQL
                            ↓
                    Publish to Redis: "profitability:project-123"
                            ↓
          ┌─────────────────┴──────────────────┐
          ▼                                    ▼
   API Server 1                         API Server 2
  (has WebSocket clients)              (has WebSocket clients)
          ↓                                    ↓
   Push to User B                      Push to User C
   (subscribed to project-123)         (subscribed to project-123)
```

**Performance:**
- Max latency: <5s from event creation to UI update
- Handle 10k concurrent WebSocket connections per server
- Graceful degradation: Fallback to polling if WebSocket fails

---

## Integration Framework

### Connector Architecture

**Interface:**
```typescript
interface IntegrationConnector {
  authenticate(credentials: OAuthCredentials): Promise<Session>
  sync(since?: Date): Promise<SyncResult>
  mapEntity(external: ExternalEntity): InternalEntity
  handleWebhook(payload: any): Promise<void>
}
```

**QuickBooks Implementation (Phase 1):**
```typescript
class QuickBooksConnector implements IntegrationConnector {
  async authenticate(credentials) {
    // OAuth 2.0 flow
    const tokens = await quickbooks.oauth2.createToken(credentials.code)
    return { accessToken, refreshToken, expiresAt }
  }
  
  async sync(since?: Date) {
    const invoices = await qb.query(`SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime > '${since}'`)
    const bills = await qb.query(`SELECT * FROM Bill WHERE ...`)
    
    const events = [
      ...invoices.map(inv => this.mapInvoiceToRevenue(inv)),
      ...bills.map(bill => this.mapBillToCost(bill))
    ]
    
    return { events, errors: [] }
  }
  
  private mapInvoiceToRevenue(invoice: QBInvoice): FinancialEvent {
    return {
      eventType: 'REVENUE',
      amount: invoice.TotalAmt,
      timestamp: new Date(invoice.TxnDate),
      sourceSystem: 'quickbooks',
      sourceId: invoice.Id,
      projectId: this.lookupProject(invoice.CustomerRef),
      metadata: { invoiceNumber: invoice.DocNumber, ... }
    }
  }
}
```

**Future Integrations:**
- Toggl/Harvest: Time tracking → LABOR_COST events
- Plaid: Banking transactions → Expense detection
- Gusto/ADP: Payroll → LABOR_COST events

---

## Technology Stack

### Backend
- **API:** NestJS (TypeScript, decorators, DI)
- **Database:** PostgreSQL 15 (relational + JSONB)
- **ORM:** Prisma (type-safe queries, migrations)
- **Cache:** Redis 7 (profitability cache, job queue)
- **Queue:** BullMQ (background jobs, retries)
- **GraphQL:** Apollo Server (subscriptions via WebSocket)

### Frontend
- **Web:** Next.js 14 (App Router, SSR, RSC)
- **Desktop:** Tauri 1.5 (Rust + webview, 15MB bundle)
- **Mobile:** React Native 0.73 (iOS/Android)
- **UI:** Tailwind CSS, Radix UI, Recharts
- **State:** Zustand (local state), React Query (server state)

### AI & ML
- **LLM:** Anthropic Claude (Opus for complex, Sonnet for speed)
- **Embeddings:** OpenAI text-embedding-3-large
- **Vector Store:** Pinecone (future: for semantic search)

### DevOps
- **Hosting:** Digital Ocean (App Platform, Managed Postgres, Spaces)
- **CI/CD:** GitHub Actions
- **Monitoring:** Datadog (APM, logs, metrics) or Grafana stack
- **Error Tracking:** Sentry

---

## Security Architecture

### Defense in Depth

**Layer 1: Network**
- TLS 1.3 everywhere
- DDoS protection (Cloudflare)
- Rate limiting (100 req/min per user)

**Layer 2: Authentication**
- JWT access tokens (15-min expiry)
- Refresh token rotation (30-day expiry)
- MFA for sensitive actions
- Session invalidation on password change

**Layer 3: Authorization**
- RBAC (5 roles: Owner, Admin, PM, Accountant, Viewer)
- Resource-level permissions (project-specific)
- Every query filtered by `organizationId`

**Layer 4: Data**
- Encryption at-rest (AES-256, PostgreSQL TDE)
- Encryption in-transit (TLS 1.3)
- Client-side encryption (SQLCipher for SQLite)
- Sensitive fields encrypted app-level (OAuth tokens)

**Layer 5: Audit**
- Immutable audit log (all auth events, data changes)
- 7-year retention (compliance)
- Exportable for external audits

---

## Deployment Architecture

### Phase 1: Single-Region, Vertically Scaled

```
                    ┌──────────────┐
                    │ Cloudflare   │
                    │     CDN      │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  ┌───────────┐     ┌───────────┐     ┌───────────┐
  │  Web App  │     │  Desktop  │     │  Mobile   │
  │  (Static) │     │   (Tauri) │     │   (RN)    │
  └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                    ┌─────▼─────┐
                    │ DO Load   │
                    │ Balancer  │
                    └─────┬─────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
  ┌───────────┐    ┌───────────┐    ┌───────────┐
  │ API Server│    │ API Server│    │ API Server│
  │  (NestJS) │    │  (NestJS) │    │  (NestJS) │
  │ Container │    │ Container │    │ Container │
  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
      ┌──────────────────┼──────────────────┐
      ▼                  ▼                  ▼
┌──────────┐      ┌──────────┐      ┌──────────┐
│PostgreSQL│      │  Redis   │      │  BullMQ  │
│ Primary  │      │  Cache   │      │  Workers │
│ (Managed)│      │          │      │          │
└─────┬────┘      └──────────┘      └──────────┘
      │
      ▼
┌──────────┐
│ Backups  │
│ (Daily)  │
└──────────┘
```

**Scaling Strategy (Year 1):**
- Start: 2 API servers (2 vCPU, 4GB RAM each)
- Database: 4 vCPU, 16GB RAM (Managed PostgreSQL)
- Scale horizontally: Add API servers as load increases
- Scale vertically: Upgrade database before hitting limits

### Phase 2: Multi-Region, Read Replicas (Year 2+)

- Add read replicas (US-East, US-West, EU)
- Geographic load balancing
- Separate worker pools per region

---

## Observability

### Logging
- **Structured JSON:** Every log entry has `traceId`, `userId`, `organizationId`
- **Levels:** ERROR, WARN, INFO, DEBUG
- **Retention:** 7 days hot (searchable), 90 days warm, 1 year cold
- **Tool:** Winston (application) + Loki (aggregation) or Datadog

### Metrics
- **Golden Signals:** Latency, traffic, errors, saturation
- **Custom:** Events ingested/min, profitability queries/sec, AI calls/day
- **Tool:** Prometheus + Grafana or Datadog

### Tracing
- **Distributed Traces:** OpenTelemetry → Jaeger
- **Every request:** API → Database, API → Redis, API → External (Claude, QuickBooks)
- **Sampling:** 100% errors, 10% success (cost control)

### Alerting
- **PagerDuty:** 24/7 on-call rotation
- **Thresholds:**
  - P95 latency >2x target for 5 min → Page
  - Error rate >1% for 5 min → Page
  - Database connections >80% → Alert
  - Disk space >80% → Alert

---

## Testing Strategy

### Unit Tests (70% of tests)
- **Location:** `packages/core/` (business logic)
- **Tool:** Vitest
- **Coverage:** 100% for profitability, allocation, validation
- **Example:** `calculateMargin()` with various event combinations

### Integration Tests (20% of tests)
- **Location:** `apps/api/` (endpoints + database)
- **Tool:** Vitest + Testcontainers (PostgreSQL in Docker)
- **Coverage:** All API endpoints, database operations
- **Example:** POST /api/events creates record, publishes to Redis

### E2E Tests (10% of tests)
- **Location:** `apps/web/e2e/`, `apps/mobile/e2e/`
- **Tool:** Playwright (web), Detox (mobile)
- **Coverage:** Critical workflows (W001-W011 from WORKFLOWS.md)
- **Example:** Create event → See profitability update in real-time

### Performance Tests
- **Tool:** k6 (load testing)
- **Scenarios:** 100 concurrent users querying profitability
- **Criteria:** P95 <500ms, error rate <1%

---

## Implementation Priorities (Phase 1)

### Sprint 1: Foundation (Weeks 1-2)
1. Monorepo setup (Turborepo + pnpm)
2. Database schema (Prisma migrations)
3. NestJS API skeleton (auth, basic CRUD)
4. Docker Compose (PostgreSQL, Redis)

### Sprint 2: Core Features (Weeks 3-4)
5. Event ingestion (manual entry, validation)
6. Profitability calculation engine
7. Multi-tenant auth & RBAC
8. Next.js dashboard (project list, profitability card)

### Sprint 3: Real-Time & Integration (Weeks 5-6)
9. GraphQL subscriptions (WebSocket)
10. QuickBooks OAuth integration
11. Sync pipeline (QB → FinancialEvents)
12. Real-time dashboard updates

### Sprint 4: Polish & Deploy (Weeks 7-8)
13. Offline-first web (IndexedDB, sync)
14. AI cost attribution (Claude integration)
15. Comprehensive tests (unit + integration + E2E)
16. Production deployment (Digital Ocean)

**Milestone:** Minimum Viable Product (MVP) ready for beta users

---

## What's NOT in Phase 1

**Deferred to Phase 2+:**
- Desktop app (Tauri)
- Mobile apps (React Native)
- CLI tool
- Additional integrations (Toggl, Harvest, Plaid)
- Advanced AI (forecasting, anomaly detection)
- Multi-currency support
- Advanced reporting (PDF exports)

**Rationale:** Validate core value proposition (real-time profitability) with web app first. Expand platforms and features based on user feedback.

---

## Success Criteria

**Technical:**
- [ ] Dashboard loads in <2s (P95)
- [ ] Profitability query <500ms (P99)
- [ ] Real-time updates within 5s
- [ ] 80% test coverage
- [ ] Zero security vulnerabilities (high/critical)
- [ ] Multi-tenant isolation verified

**Functional:**
- [ ] Create organization & first project
- [ ] Connect QuickBooks, sync transactions
- [ ] View real-time project profitability
- [ ] Create manual financial events
- [ ] AI explains margin changes
- [ ] Offline event creation (web)

**Business:**
- [ ] 10 beta users onboarded
- [ ] All beta users eliminate Excel for cost tracking
- [ ] NPS >50

---

## Next Steps

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed task breakdown and acceptance criteria.

---

**Last Review:** 2026-02-03  
**Next Review:** After Sprint 2 (adjust based on learnings)
