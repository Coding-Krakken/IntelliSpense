# IntelliSpense Architectural Principles

**Last Updated:** February 3, 2026  
**Status:** Foundational Document - Engineering Constraints  
**Owner:** Architecture Team

---

## Purpose

This document defines **immutable architectural principles** and **invariants** that govern all technical decisions in IntelliSpense. 

**When code violates these principles, the code is wrong, not the principles.**

Exceptions require explicit documentation in `DECISION_LOG.md` with justification and sunset date.

---

## Core Architectural Principles

### P1: Financial Events Are Immutable

**Principle:**  
Once a financial event (cost, revenue, allocation) is persisted, it cannot be modified or deleted. Corrections are new events that reference the original.

**Manifestation:**
- Event store is append-only
- No UPDATE or DELETE statements on `FinancialEvent` table
- Corrections create `ADJUSTMENT` events with `correctsEventId` reference
- Temporal queries using `validFrom` / `validTo` for point-in-time accuracy

**Rationale:**
- **Auditability:** Regulators and auditors require immutable history
- **Debuggability:** Can replay events to understand how profitability was calculated at any moment
- **Trust:** Users know numbers won't silently change

**Violations:**
- ❌ Allowing in-place edits of events
- ❌ Soft deletes that hide events from standard queries
- ❌ Overwriting historical profitability calculations

**Testing:**
- Unit test: Attempt to UPDATE event → Must fail
- Integration test: Create correction event → Must preserve original + create new
- Audit test: Query profitability as of past date → Must match historical calculation

---

### P2: AI Decisions Must Be Explainable

**Principle:**  
Every AI-generated output (cost attribution, explanation, recommendation) must include: (1) reasoning, (2) source data references, (3) confidence score, (4) model version.

**Manifestation:**
- `AIDecision` table stores: input context, output, reasoning, sources[], confidence, modelVersion, timestamp
- UI displays "Why?" button next to AI-generated data
- API responses include `explanation` and `sources[]` fields
- Prompts versioned in code with git history

**Rationale:**
- **Trust:** Users won't adopt AI that feels like a black box
- **Compliance:** Financial decisions require audit trail
- **Debugging:** When AI is wrong, we need reproducible context
- **Learning:** User feedback improves future AI with traceable corrections

**Violations:**
- ❌ Direct LLM calls without logging inputs/outputs
- ❌ Displaying AI results without explanation UI
- ❌ Confidence scores <70% shown as facts (mark as "Suggested" instead)

**Testing:**
- Unit test: AI attribution → Must return explanation + sources
- E2E test: Click "Why did margin drop?" → Explanation references specific events
- Compliance test: Export AI decision log → Contains full context for audit

---

### P3: Offline-First: Every Client Must Function Without Server

**Principle:**  
All clients (desktop, mobile, web PWA) store complete local replica of user's data and operate fully without internet connectivity. Server is synchronization point, not dependency.

**Manifestation:**
- SQLite databases on desktop/mobile
- IndexedDB with Dexie.js on web
- All reads from local storage
- Writes queued locally, synced when online
- Conflict-free merge using Hybrid Logical Clocks

**Rationale:**
- **Reality of Field Work:** Construction sites, rural areas, travel = unreliable connectivity
- **Performance:** Local reads are 10-100x faster than network calls
- **Resilience:** Server downtime doesn't halt user productivity
- **User Experience:** Instant UI feedback, no loading spinners for reads

**Violations:**
- ❌ API calls blocking UI for read operations
- ❌ Features that fail without network
- ❌ "You're offline" error messages preventing usage

**Testing:**
- E2E test: Disconnect network → All features work except sync
- Performance test: Read operations complete in <50ms (no network)
- Conflict test: Two offline clients edit same project → Merge successfully on sync

---

### P4: API-First: Backend Exposes All Functionality via API

**Principle:**  
Every feature implemented in backend must be accessible via versioned REST or GraphQL API. Web app is a consumer, not special case.

**Manifestation:**
- NestJS backend with OpenAPI spec auto-generated
- GraphQL schema for complex queries
- Web app, desktop, mobile, CLI all use same APIs
- No direct database access from clients
- API versioning: `/api/v1/`, `/api/v2/` with deprecation policy

**Rationale:**
- **Multi-Platform:** Desktop, mobile, CLI all need same capabilities
- **Ecosystem:** Third-party integrations rely on stable APIs
- **Evolution:** Can replace frontend without backend changes
- **Testing:** API tests validate business logic independent of UI

**Violations:**
- ❌ Business logic in frontend components
- ❌ Web app accessing different endpoints than mobile
- ❌ Breaking API changes without version bump

**Testing:**
- Contract test: OpenAPI spec matches implementation
- Integration test: All UI features map to documented API endpoints
- Versioning test: API v1 clients still work after v2 release

---

### P5: Real-Time by Default

**Principle:**  
Users see profitability changes within 5 seconds of underlying event creation, across all connected devices.

**Manifestation:**
- WebSocket connections for GraphQL subscriptions
- Redis pub/sub for event broadcasting
- Optimistic UI updates (show change immediately, rollback on error)
- Server-Sent Events fallback where WebSockets unavailable

**Rationale:**
- **Decision Latency:** Waiting for batch reports causes preventable losses
- **User Delight:** Real-time updates feel magical, create trust in system
- **Collaboration:** Multiple users on same project see changes instantly

**Violations:**
- ❌ Scheduled batch jobs for profitability recalculation (must be event-driven)
- ❌ Polling for updates (inefficient, not real-time)
- ❌ Dashboard showing stale data without "Last updated" timestamp

**Testing:**
- E2E test: User A creates event → User B sees profitability update in <5s
- Load test: 1000 concurrent users → All receive real-time updates
- Latency test: Event ingestion → UI update p99 <3s

---

### P6: Type Safety Across Stack

**Principle:**  
All data structures validated at compile-time with TypeScript types shared between client and server. Runtime validation via Zod schemas.

**Manifestation:**
- Monorepo with `packages/core` shared types
- Prisma generates TypeScript types from database schema
- Zod schemas in `packages/core/schemas` for runtime validation
- tRPC or GraphQL Code Generator for type-safe API calls
- No `any` types in production code (ESLint enforced)

**Rationale:**
- **Reliability:** Type errors caught at compile-time, not runtime
- **Velocity:** Autocomplete and IntelliSense speed development
- **Refactoring:** Breaking changes caught across entire stack
- **Collaboration:** Types are self-documenting contracts

**Violations:**
- ❌ Using `any`, `unknown` without explicit validation
- ❌ API responses without TypeScript interfaces
- ❌ Skipping Zod validation on user inputs

**Testing:**
- CI test: TypeScript compilation with strict mode
- Lint test: No `any` types in codebase
- Integration test: API returns data matching TypeScript type

---

### P7: Cost Attribution Follows Explicit Rules, AI Proposes, Human Approves

**Principle:**  
Shared costs (overhead, admin) allocated via configurable rules stored in database. AI suggests allocations but cannot apply without user confirmation (except when user pre-approves pattern).

**Manifestation:**
- `CostCenter` table stores allocation rules (JSON schema)
- AI generates allocation with reasoning + confidence score
- UI shows: "AI suggests: Allocate $5k office rent: 60% Project A (larger team), 40% Project B [Approve] [Adjust]"
- User approval creates immutable event citing AI decision
- "Remember this pattern" creates reusable rule

**Rationale:**
- **Control:** Financial decisions too important for fully autonomous AI
- **Trust:** Users verify AI reasoning before accepting
- **Learning:** User corrections improve future suggestions
- **Compliance:** Auditors need human accountability for allocations

**Violations:**
- ❌ AI automatically applying cost allocations without confirmation
- ❌ Hiding allocation logic from users
- ❌ No mechanism to override or adjust AI suggestions

**Testing:**
- E2E test: AI suggests allocation → User rejects → No event created
- Learning test: User corrects pattern 3x → AI learns, improves accuracy
- Audit test: Export shows human approved each AI allocation

---

### P8: Data Ownership: Users Own Their Data, Can Export Anytime

**Principle:**  
All user data exportable in standard formats (CSV, JSON, PDF) with zero lock-in. Export includes full event history, audit logs, and AI decisions.

**Manifestation:**
- `/api/export/full` returns complete data dump
- Format options: JSON (machine-readable), CSV (Excel-compatible), PDF (human-readable)
- Export includes: events, projects, profitability calculations, AI decisions, audit logs
- CLI tool: `intellispense export --format=json > backup.json`
- No artificial rate limits on export (within reason)

**Rationale:**
- **Trust:** Users know they can leave anytime (reduces adoption friction)
- **Compliance:** GDPR requires data portability
- **Backup:** Users can maintain independent backups
- **Switching Costs:** Low lock-in aligns with user interest (and increases confidence)

**Violations:**
- ❌ Export requires support ticket or manual process
- ❌ Proprietary formats requiring IntelliSpense to read
- ❌ Incomplete exports missing event history or AI reasoning

**Testing:**
- Integration test: Export → Import to fresh instance → Data integrity verified
- Compliance test: Time from export request to delivery <5 minutes
- Format test: CSV opens in Excel without errors

---

### P9: Progressive Disclosure: Simple by Default, Powerful When Needed

**Principle:**  
UI shows minimal information for 80% use case, expands for power users. Keyboard shortcuts, CLI, and API available for experts without cluttering UI for novices.

**Manifestation:**
- Dashboard shows 5 key metrics by default
- "Show Details" reveals task-level breakdown
- Keyboard shortcuts: `Cmd+K` command palette
- CLI for scripting and automation
- Mobile: Simple by necessity, links to web for deep dives

**Rationale:**
- **Onboarding:** New users aren't overwhelmed
- **Efficiency:** Experts aren't slowed by simplified UI
- **Scalability:** Same product serves solo operators and enterprises

**Violations:**
- ❌ Exposing all features on every screen (visual clutter)
- ❌ Hiding power features so deeply they're undiscoverable
- ❌ Dumbing down for simplicity at expense of functionality

**Testing:**
- Usability test: New user finds key info in <30 seconds
- Power user test: Expert completes task via keyboard shortcuts
- Mobile test: Essential features reachable in <3 taps

---

### P10: Security Defense-in-Depth

**Principle:**  
Multiple layers of security: network, authentication, authorization, data, audit. Compromise of one layer doesn't expose everything.

**Manifestation:**
- **Network:** TLS 1.3, DDoS protection (Cloudflare)
- **Authentication:** JWT + refresh tokens, MFA, SSO
- **Authorization:** Row-level security (organizationId filtering), role-based permissions
- **Data:** Encryption at-rest (DB), in-transit (TLS), client-side (SQLCipher)
- **Audit:** Immutable log of all security events (login, permission changes, exports)

**Rationale:**
- **Threat Model:** Financial data is high-value target
- **Compliance:** SOC 2, GDPR, PCI-DSS require defense-in-depth
- **Resilience:** Single vulnerability doesn't cause total breach
- **Trust:** Security posture is competitive differentiator

**Violations:**
- ❌ Single authentication mechanism (password only)
- ❌ Authorization checks only at API level (not database)
- ❌ Unencrypted sensitive data (API keys, tokens)

**Testing:**
- Penetration test: OWASP Top 10 vulnerabilities (annual)
- Access control test: User A cannot access Organization B's data
- Encryption test: Database dump unreadable without keys

---

## Invariants That Must Never Be Violated

### I1: Financial Event Integrity

**Invariant:** Every financial event must have:
- Unique ID (UUID)
- Timestamp (UTC, nanosecond precision)
- Amount (decimal, never float for precision)
- Organization ID (multi-tenant isolation)
- Source system + source ID (idempotency, traceability)

**Enforcement:**
- Database constraints: NOT NULL on required fields
- Zod schema validation before persistence
- Unique index on (organizationId, sourceSystem, sourceId)

**Why Critical:**  
Violating this corrupts profitability calculations and makes data untrustable.

---

### I2: Multi-Tenant Isolation

**Invariant:** User from Organization A cannot access data from Organization B under any circumstance.

**Enforcement:**
- Every query filtered by `organizationId` (from JWT claims)
- Row-level security in ORM (Prisma middleware)
- API tests verify isolation (attempt cross-org access → 403)
- Database views enforce isolation (no raw table access)

**Why Critical:**  
Data breach across organizations is catastrophic for trust and compliance.

---

### I3: Backward-Compatible API Evolution

**Invariant:** Adding features is safe; removing/changing requires new API version.

**Enforcement:**
- New fields: Optional by default
- Old endpoints: Deprecated with 6-month sunset
- Breaking changes: Increment version (`/api/v1/` → `/api/v2/`)
- OpenAPI spec changelog tracked in git

**Why Critical:**  
Breaking client integrations destroys ecosystem trust.

---

### I4: Profitability Calculation Determinism

**Invariant:** Given same events, profitability calculation must return identical result.

**Enforcement:**
- Pure functions in `packages/core/profitability.ts`
- No external dependencies (time zones, random numbers)
- All inputs versioned (tax rates, allocation rules)
- Unit tests with fixed input → fixed output

**Why Critical:**  
Non-deterministic calculations make debugging impossible and erode user trust.

---

### I5: AI Traceability

**Invariant:** Every AI-generated output must be reproducible from logged inputs.

**Enforcement:**
- `AIDecision` table logs: input, output, model, version, timestamp
- Prompt templates versioned in git
- LLM API responses stored (or hash for PII/space)
- Reproduction test: Re-run with stored inputs → Same output

**Why Critical:**  
Without traceability, debugging AI failures and compliance auditing is impossible.

---

## Tradeoff Philosophy

### When to Favor Performance Over Features
- Core loops: Profitability calculation, event ingestion, dashboard rendering
- Metric: p99 latency <500ms for critical paths
- Accept: Code complexity, caching layers, denormalization
- Reject: Slow features in critical path (move to async background jobs)

### When to Favor Simplicity Over Optimization
- Admin features: Used infrequently by small user subset
- Non-critical paths: Report generation, export, settings
- Accept: Slower response times (5-10s acceptable)
- Reject: Premature optimization adding complexity

### When to Favor Correctness Over Speed
- Financial calculations: Precision matters more than milliseconds
- Audit logs: Complete data more important than performance
- Accept: Slower writes for stronger consistency guarantees
- Reject: Eventual consistency for financial events (must be immediate)

### When to Favor Flexibility Over Performance
- Configuration: User-defined allocation rules, thresholds, notifications
- Integration mappings: Custom field mappings per organization
- Accept: Dynamic execution (interpreted rules) vs hardcoded
- Reject: Performance optimization that limits customization

---

## Performance Standards

### Response Time Requirements

| Operation | p50 | p95 | p99 | Timeout |
|-----------|-----|-----|-----|---------|
| Dashboard load (initial) | <1s | <2s | <3s | 5s |
| Profitability query | <200ms | <500ms | <1s | 3s |
| Event ingestion | <100ms | <300ms | <500ms | 2s |
| AI explanation | <2s | <5s | <8s | 15s |
| Real-time update delivery | <1s | <3s | <5s | 10s |
| Sync (1000 events) | <5s | <10s | <15s | 30s |
| Report generation | <3s | <8s | <15s | 60s |
| Export (full data) | <10s | <30s | <60s | 300s |

**Violations trigger alerts; p99 breaches block release.**

---

## Reliability Standards

### Availability Targets
- **API:** 99.9% uptime (8.76 hours downtime/year)
- **Web App:** 99.5% (43.8 hours, allows for deployments)
- **Real-time updates:** 99% (tolerate brief WebSocket disconnects)

### Data Durability
- **Financial events:** 99.9999999% (11 nines via replicated Postgres + backups)
- **Derived data (profitability cache):** Can be regenerated, no durability requirement

### Error Budgets
- Monthly error budget: 0.1% of requests can fail
- Once exhausted: Feature freeze, focus on reliability
- Reset monthly

---

## Security Standards

### Authentication Requirements
- Minimum: Email + password with bcrypt (cost factor 12)
- Recommended: MFA via TOTP or SMS
- Enterprise: SSO with SAML 2.0 or OIDC

### Authorization Model
- Role-Based Access Control (RBAC)
- Roles: Owner, Admin, ProjectManager, Accountant, Viewer
- Permissions granular: `projects:read`, `events:write`, `integrations:manage`
- Enforcement: Every API endpoint, every database query

### Data Encryption
- At-rest: AES-256 (Postgres Transparent Data Encryption)
- In-transit: TLS 1.3 with perfect forward secrecy
- Client-side: SQLCipher for mobile/desktop databases (AES-256)

### Audit Logging
- Log all: Authentication events, financial event creation, permission changes, data exports
- Retention: 7 years (compliance requirement)
- Immutable: Append-only audit log table

---

## Testing Standards

### Code Coverage Requirements
- **Core business logic** (`packages/core/`): 100%
- **API endpoints** (`apps/api/`): 90%
- **Frontend components** (`apps/web/`): 70%
- **Overall:** 80% minimum

### Test Types
- **Unit:** Fast (<10ms), no I/O, pure logic
- **Integration:** Database, Redis, external APIs (mocked)
- **E2E:** Full user workflows, real browsers (Playwright)
- **Performance:** Load testing (k6), chaos engineering
- **Security:** OWASP Top 10, penetration testing (annual)

### CI/CD Gates
- [ ] All tests pass
- [ ] Code coverage meets thresholds
- [ ] No new ESLint warnings
- [ ] No high/critical dependency vulnerabilities
- [ ] OpenAPI schema validates
- [ ] Database migrations succeed
- [ ] Performance tests within SLA

**No merge to main without passing all gates.**

---

## Observability Standards

### Logging
- **Structured logs:** JSON format with consistent fields
- **Levels:** ERROR (immediate attention), WARN (investigate), INFO (audit trail), DEBUG (development)
- **Context:** Every log includes: userId, organizationId, traceId, timestamp
- **Retention:** 90 days hot, 1 year cold storage

### Metrics
- **Golden Signals:** Latency, traffic, errors, saturation
- **Business Metrics:** Events/minute, profitability queries/second, AI calls/day
- **Dashboards:** Grafana with alerts for SLA breaches

### Tracing
- **Distributed tracing:** OpenTelemetry with trace propagation
- **Span every:** API call, database query, external integration, AI call
- **Sampling:** 100% of errors, 10% of successes (cost control)

### Alerting
- **On-call rotation:** PagerDuty with escalation
- **Alert threshold:** p99 latency >SLA for 5 minutes
- **Runbooks:** Every alert links to documented remediation steps

---

## Compliance Standards

### Data Residency
- **Default:** Data stored in user's chosen region (US, EU, Asia-Pacific)
- **GDPR:** EU data never leaves EU
- **Compliance:** China, Russia: No regions by default (complex requirements)

### Retention Policies
- **Financial events:** 7 years (IRS, GAAP requirements)
- **Audit logs:** 7 years
- **User data:** Deleted within 30 days of account closure request (GDPR)
- **AI decisions:** 3 years (sufficient for debugging, not perpetual)

### Compliance Certifications (Roadmap)
- **Q3 2026:** SOC 2 Type I
- **Q1 2027:** SOC 2 Type II
- **Q3 2027:** ISO 27001
- **2028:** PCI-DSS (if handling payments directly)

---

## Governance

### Amendment Process
1. Propose change via PR to this document
2. Require approval from: Engineering Lead + 2 senior engineers
3. Update `DECISION_LOG.md` with rationale
4. Propagate to affected documents (`SYSTEM_MODEL.md`, code annotations)
5. Announce in engineering all-hands

### Conflict Resolution
- **Principle vs convenience:** Principle wins unless system requirement changed
- **Principle vs principle:** Escalate to Architecture Review Board (ARB)
- **Temporary exception:** Documented in `DECISION_LOG.md` with sunset date (max 6 months)

### Review Cadence
- **Quarterly:** Architecture Review Board reviews principles alignment
- **Annual:** Deep review with possibility of principled evolution
- **Post-incident:** Review if incident violated principle (fix principle or enforcement)

---

**This document is immutable unless explicitly amended.**  
**When in doubt, default to these principles.**  
**Code that violates principles is rejected at code review.**
