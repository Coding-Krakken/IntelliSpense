# IntelliSpense Implementation Plan

**Last Updated:** February 3, 2026  
**Status:** Active Development  
**Owner:** Engineering Team

---

## Overview

This document breaks down the implementation of IntelliSpense Phase 1 (Real-Time Profitability Tracker) into concrete, testable milestones. Each milestone includes tasks, acceptance criteria, and quality gates.

**Timeline:** 8 weeks (2-week sprints × 4)  
**Target:** Production-ready MVP for beta users

---

## Implementation Principles

**Throughout all phases:**

1. **No Placeholders:** Every feature must be fully functional end-to-end
2. **Production Quality:** Code must meet quality gates (tests, security, performance)
3. **Document-Driven:** All implementation must align with design docs (VISION, PRINCIPLES, SYSTEM_MODEL)
4. **Iterative Delivery:** Each sprint produces deployable increment
5. **Testing First:** Unit/integration tests written alongside implementation
6. **Security by Default:** Multi-tenant isolation, auth checks, input validation

---

## Phase 1: Foundation & MVP (8 Weeks)

### Milestone 1: Development Infrastructure (Week 1)

**Goal:** Establish development environment and project skeleton

#### Tasks

**M1.1: Initialize Monorepo**
- [ ] Create root `package.json` with Turborepo
- [ ] Configure pnpm workspaces
- [ ] Set up apps/ and packages/ structure
- [ ] Create turbo.json (build pipeline)
- [ ] Configure TypeScript (strict mode, paths)

**M1.2: Shared Tooling**
- [ ] ESLint config (packages/config/eslint)
- [ ] Prettier config (packages/config/prettier)
- [ ] TypeScript config (packages/config/typescript)
- [ ] Husky + lint-staged (pre-commit hooks)
- [ ] GitHub Actions CI pipeline

**M1.3: Docker Development Environment**
- [ ] docker-compose.yml (PostgreSQL 15, Redis 7)
- [ ] Database initialization scripts
- [ ] Environment variable templates (.env.example)

**M1.4: Database Foundation**
- [ ] Initialize Prisma in packages/database
- [ ] Define core schema (Organization, User, OrganizationMembership)
- [ ] Create initial migration
- [ ] Seed script (system bootstrap data)

**Acceptance Criteria:**
- ✅ `pnpm install` works from root
- ✅ `pnpm build` compiles all packages
- ✅ `docker-compose up` starts PostgreSQL + Redis
- ✅ `pnpm prisma migrate dev` applies migrations
- ✅ CI pipeline runs (lint, typecheck, build)
- ✅ All configs pass strict TypeScript checks

**Quality Gates:**
- Zero ESLint errors
- TypeScript strict mode enabled
- Docker containers start in <30s

---

### Milestone 2: Database Schema & Core Entities (Week 1-2)

**Goal:** Implement complete data model from SYSTEM_MODEL.md

#### Tasks

**M2.1: Financial Entities**
- [ ] FinancialEvent table (immutable, append-only)
  - All fields from SYSTEM_MODEL.md
  - Composite unique index: (organizationId, sourceSystem, sourceId)
  - Temporal columns: validFrom, validTo
  - Indexes for query performance
- [ ] ProjectProfitabilitySnapshot table
- [ ] AIDecision table

**M2.2: Project Management Entities**
- [ ] Project table (status enum, relationships)
- [ ] Task table (hierarchical, parent-child)
- [ ] Client table

**M2.3: Organization Entities**
- [ ] Employee table
- [ ] CostCenter table (allocation rules in JSONB)

**M2.4: Integration Entities**
- [ ] Integration table (credentials encrypted)
- [ ] SyncLog table

**M2.5: Supporting Tables**
- [ ] Notification table
- [ ] AuditLog table (immutable)
- [ ] SyncQueue table (for offline clients)

**M2.6: Prisma Client Generation**
- [ ] Generate TypeScript types
- [ ] Create barrel exports (packages/database/index.ts)
- [ ] Set up Prisma middleware (org filtering)

**M2.7: Database Constraints**
- [ ] Check constraints (amount precision, date validation)
- [ ] Foreign key cascade rules
- [ ] Triggers for audit logging (if needed)

**Acceptance Criteria:**
- ✅ All entities from SYSTEM_MODEL.md implemented
- ✅ 100% schema matches documented model
- ✅ Migrations run cleanly on fresh database
- ✅ Prisma Client generates without errors
- ✅ Seed script creates valid test data
- ✅ All indexes defined for query performance

**Quality Gates:**
- Database migration completes in <10s
- Prisma generate completes in <30s
- No nullable fields missing defaults
- All enums match SYSTEM_MODEL.md exactly

---

### Milestone 3: Authentication & Authorization (Week 2)

**Goal:** Secure multi-tenant authentication with RBAC

#### Tasks

**M3.1: Auth Module Setup (NestJS)**
- [ ] Create apps/api (NestJS project)
- [ ] Install dependencies (passport, bcrypt, jsonwebtoken)
- [ ] Configure environment variables

**M3.2: User Registration & Login**
- [ ] POST /api/auth/register
  - Validate email format (Zod)
  - Hash password (bcrypt cost factor 12)
  - Create User + Organization + OrganizationMembership (OWNER role)
  - Return access + refresh tokens (JWT)
- [ ] POST /api/auth/login
  - Verify email + password
  - Generate JWT with organizationId claim
  - Return access (15-min) + refresh (30-day) tokens

**M3.3: JWT Authentication**
- [ ] JwtAuthGuard (NestJS guard)
- [ ] Extract user from JWT claims
- [ ] Validate token signature & expiry
- [ ] Check token revocation (Redis blacklist)

**M3.4: Multi-Tenant Middleware**
- [ ] Prisma middleware: auto-inject organizationId filter
- [ ] Request context: attach user + organizationId
- [ ] Validate all queries include org filter

**M3.5: RBAC Implementation**
- [ ] @RequireRole decorator (Owner, Admin, PM, Accountant, Viewer)
- [ ] @RequirePermission decorator (resource:action)
- [ ] Permission checking service
- [ ] Role hierarchy enforcement

**M3.6: Token Refresh Flow**
- [ ] POST /api/auth/refresh
  - Validate refresh token
  - Rotate refresh token (single-use)
  - Issue new access token

**M3.7: Audit Logging**
- [ ] Log all auth events (login, register, refresh, logout)
- [ ] Store in AuditLog table
- [ ] Include IP address, user agent

**Acceptance Criteria:**
- ✅ User can register → Creates org + user + membership
- ✅ User can login → Returns valid JWT
- ✅ Protected endpoints reject unauthenticated requests (401)
- ✅ Users from Org A cannot access Org B data (403)
- ✅ Role-based permissions enforced
- ✅ Expired tokens rejected
- ✅ Refresh token rotation works
- ✅ All auth events logged

**Quality Gates:**
- Integration tests: Auth flows (register, login, protect endpoint)
- Zero security vulnerabilities (npm audit)
- Password hashing uses bcrypt cost >=12
- JWT secret minimum 256 bits

---

### Milestone 4: Core Business Logic (Week 2-3)

**Goal:** Implement profitability calculation engine and event validation

#### Tasks

**M4.1: Core Package Setup**
- [ ] Create packages/core (pure TypeScript, no framework deps)
- [ ] Set up Vitest for unit testing
- [ ] Create barrel exports

**M4.2: Validation Schemas (Zod)**
- [ ] FinancialEventSchema (all fields, business rules)
- [ ] ProjectSchema
- [ ] OrganizationSchema
- [ ] Export from packages/core/schemas

**M4.3: Profitability Calculation**
- [ ] calculateMargin(events: FinancialEvent[]): ProfitabilityResult
  - Revenue sum
  - Cost breakdowns (labor, materials, overhead, equipment, subcontractors)
  - Margin calculation
  - Margin percentage (handle div by zero)
- [ ] calculateProjectProfitability(projectId, asOfDate?)
  - Query events with temporal filtering
  - Cache result in Redis
  - Return typed result

**M4.4: Cost Attribution Logic**
- [ ] allocateOverhead(amount, projects, rule: AllocationRule)
  - EQUAL split
  - REVENUE_BASED proportional
  - LABOR_HOURS proportional
  - CUSTOM_FORMULA evaluation (planned, not Phase 1)

**M4.5: Temporal Query Helpers**
- [ ] getEventsAsOf(projectId, date): Filter by validFrom/validTo
- [ ] getActiveEvents(projectId): Where validTo IS NULL

**M4.6: Unit Tests**
- [ ] calculateMargin: Various event combinations
- [ ] Edge cases: Zero revenue, all costs, negative margins
- [ ] Temporal queries: Past dates, corrections

**Acceptance Criteria:**
- ✅ calculateMargin returns correct results (100% test coverage)
- ✅ Handles edge cases without errors
- ✅ Temporal queries work correctly
- ✅ All schemas validate input correctly
- ✅ Zero dependencies on frameworks (pure functions)

**Quality Gates:**
- 100% unit test coverage (packages/core)
- All tests pass in <1s
- No `any` types
- JSDoc comments on public functions

---

### Milestone 5: API Endpoints (Week 3)

**Goal:** RESTful API for core CRUD operations

#### Tasks

**M5.1: Projects API**
- [ ] POST /api/projects (create project)
- [ ] GET /api/projects (list org's projects)
- [ ] GET /api/projects/:id (get project details)
- [ ] PATCH /api/projects/:id (update project)
- [ ] GET /api/projects/:id/profitability (calculate & return)

**M5.2: Financial Events API**
- [ ] POST /api/events (create event with validation)
- [ ] GET /api/events (list events, filterable by project, type, date range)
- [ ] GET /api/events/:id (get single event)
- [ ] POST /api/events/:id/correct (create correction event)

**M5.3: Organizations API**
- [ ] GET /api/organizations/me (current user's org)
- [ ] PATCH /api/organizations/me (update settings)

**M5.4: Users API**
- [ ] GET /api/users/me (current user profile)
- [ ] PATCH /api/users/me (update profile)
- [ ] POST /api/users/invite (invite user to org)

**M5.5: Validation & Error Handling**
- [ ] Zod validation on all inputs
- [ ] RFC 7807 Problem Details for errors
- [ ] Consistent error responses

**M5.6: Integration Tests**
- [ ] Test all endpoints with real database (Testcontainers)
- [ ] Test multi-tenant isolation
- [ ] Test permission checks

**Acceptance Criteria:**
- ✅ All endpoints documented (Swagger/OpenAPI)
- ✅ Input validation returns clear errors
- ✅ Multi-tenant isolation verified
- ✅ Permission checks pass
- ✅ Integration tests cover happy + error paths
- ✅ API returns typed responses

**Quality Gates:**
- 90% integration test coverage (apps/api)
- All endpoints respond in <500ms (P95)
- OpenAPI spec validates
- Zero unhandled exceptions

---

### Milestone 6: Web Dashboard Foundation (Week 3-4)

**Goal:** Next.js web app with authentication and project list

#### Tasks

**M6.1: Next.js Setup**
- [ ] Create apps/web (Next.js 14, App Router)
- [ ] Configure Tailwind CSS
- [ ] Set up environment variables
- [ ] Create layout components

**M6.2: Authentication UI**
- [ ] /login page (email + password form)
- [ ] /register page (create account)
- [ ] Auth context (store JWT in httpOnly cookie)
- [ ] Protected route wrapper

**M6.3: API Client (packages/api-client)**
- [ ] fetch wrapper with auth headers
- [ ] Type-safe API calls (generated from OpenAPI or manual)
- [ ] Error handling

**M6.4: Dashboard Layout**
- [ ] Sidebar navigation
- [ ] Header (org switcher, user menu)
- [ ] Responsive layout

**M6.5: Project List Page (/projects)**
- [ ] Fetch projects from API
- [ ] Display project cards:
  - Name, status, dates
  - Current margin (color-coded)
  - Trend indicator
- [ ] Link to project detail page

**M6.6: Project Detail Page (/projects/[id])**
- [ ] Fetch project + profitability
- [ ] Display:
  - Project header
  - Profitability card (revenue, costs, margin)
  - Trend chart (mock for now, real data Phase 1.5)
  - Event timeline

**M6.7: Create Event Form**
- [ ] Modal or page for creating events
- [ ] Form fields (amount, type, date, description)
- [ ] Submit to POST /api/events
- [ ] Optimistic UI update

**Acceptance Criteria:**
- ✅ User can register and login
- ✅ Dashboard shows user's projects
- ✅ Project detail shows profitability
- ✅ User can create manual event
- ✅ UI updates after event creation
- ✅ Responsive design (mobile, tablet, desktop)

**Quality Gates:**
- Lighthouse score >90 (performance, accessibility)
- Zero console errors
- All forms have validation
- Loading states for async operations

---

### Milestone 7: Real-Time Updates (Week 4)

**Goal:** WebSocket subscriptions for live profitability updates

#### Tasks

**M7.1: GraphQL Server Setup**
- [ ] Install Apollo Server in apps/api
- [ ] Configure GraphQL schema
- [ ] Set up WebSocket transport

**M7.2: GraphQL Schema**
- [ ] Type definitions (Project, FinancialEvent, Profitability)
- [ ] Queries (projects, profitability)
- [ ] Mutations (createEvent)
- [ ] Subscriptions (profitabilityUpdated)

**M7.3: Redis PubSub**
- [ ] Configure Redis as pubsub adapter
- [ ] Publish events on FinancialEvent creation
- [ ] Subscribe to profitability updates

**M7.4: Subscription Resolver**
- [ ] profitabilityUpdated(projectId): Filtered by user access
- [ ] Recalculate profitability on event creation
- [ ] Publish to subscribers

**M7.5: Web Client Subscription**
- [ ] Apollo Client in apps/web
- [ ] Subscribe to profitabilityUpdated
- [ ] Update UI on real-time event
- [ ] Animate margin change

**M7.6: Fallback Mechanism**
- [ ] Detect WebSocket failure
- [ ] Fall back to polling (30s interval)
- [ ] Show offline indicator

**Acceptance Criteria:**
- ✅ Event creation triggers profitability update
- ✅ All subscribed clients receive update within 5s
- ✅ UI animates margin change
- ✅ Graceful degradation to polling on WS failure
- ✅ No memory leaks (subscription cleanup)

**Quality Gates:**
- P95 latency <5s (event → UI update)
- Handle 1000 concurrent WebSocket connections
- E2E test: Real-time update across two clients

---

### Milestone 8: QuickBooks Integration (Week 5)

**Goal:** OAuth connection and transaction sync from QuickBooks Online

#### Tasks

**M8.1: QuickBooks OAuth Setup**
- [ ] Register app in Intuit Developer Portal
- [ ] Configure redirect URI
- [ ] Store client ID/secret in env

**M8.2: OAuth Flow**
- [ ] GET /api/integrations/quickbooks/connect (initiate OAuth)
- [ ] GET /api/integrations/quickbooks/callback (handle redirect)
- [ ] Store access + refresh tokens (encrypted in Integration table)

**M8.3: QuickBooks Connector**
- [ ] Create QuickBooksConnector class
- [ ] authenticate(): OAuth token exchange
- [ ] refreshToken(): Token refresh logic
- [ ] sync(since?: Date): Fetch invoices, bills, journal entries

**M8.4: Entity Mapping**
- [ ] Map QB Customer → IntelliSpense Client
- [ ] Map QB Class → IntelliSpense Project
- [ ] Map QB Invoice → REVENUE event
- [ ] Map QB Bill → MATERIAL_COST event

**M8.5: Sync Pipeline**
- [ ] SyncService: Orchestrate sync process
- [ ] Fetch data from QB API
- [ ] Transform to FinancialEvent
- [ ] Deduplicate (sourceSystem + sourceId)
- [ ] Insert events
- [ ] Log to SyncLog

**M8.6: Sync UI**
- [ ] /settings/integrations page
- [ ] "Connect QuickBooks" button → OAuth flow
- [ ] Display connection status
- [ ] "Sync Now" button
- [ ] Show last sync time + results

**M8.7: Background Sync Worker**
- [ ] BullMQ worker for scheduled syncs
- [ ] Cron: Every hour
- [ ] Handle errors, retries
- [ ] Notify user on failure

**Acceptance Criteria:**
- ✅ User can connect QuickBooks via OAuth
- ✅ Initial sync fetches all transactions
- ✅ Incremental sync fetches only new transactions
- ✅ Events deduplicated (no duplicates on re-sync)
- ✅ Profitability reflects synced data
- ✅ Sync errors logged, user notified

**Quality Gates:**
- Initial sync (100 transactions) completes in <30s
- Integration test: Mock QB API, verify events created
- Handles OAuth token expiry gracefully
- No credentials in logs

---

### Milestone 9: Offline-First Web (Week 5-6)

**Goal:** Web app works offline with IndexedDB

#### Tasks

**M9.1: IndexedDB Setup (Dexie.js)**
- [ ] Install Dexie
- [ ] Define schema matching server
- [ ] Create database wrapper

**M9.2: Sync Service (Client)**
- [ ] Download org data on login
- [ ] Store in IndexedDB
- [ ] Read from IndexedDB for all queries

**M9.3: Offline Write Queue**
- [ ] Queue events created offline
- [ ] Mark with _syncStatus: 'pending'
- [ ] Show "Pending sync" badge in UI

**M9.4: Background Sync**
- [ ] Detect online/offline status
- [ ] POST /api/sync/push (upload pending changes)
- [ ] GET /api/sync/pull (download server changes since lastSync)
- [ ] Merge changes, resolve conflicts

**M9.5: Conflict Resolution**
- [ ] Events: Append-only (no conflicts)
- [ ] Projects: Last-write-wins (timestamp comparison)
- [ ] Show conflict notification if detected

**M9.6: Service Worker (PWA)**
- [ ] Cache static assets
- [ ] Cache API responses
- [ ] Serve from cache when offline
- [ ] Background sync API (for push)

**Acceptance Criteria:**
- ✅ User can create events offline
- ✅ Events synced when connection restored
- ✅ UI shows offline indicator
- ✅ Profitability calculated from local data
- ✅ No data loss on sync

**Quality Gates:**
- Offline events sync within 30s of reconnect
- IndexedDB queries <50ms
- E2E test: Create event offline, verify sync online
- No sync conflicts in normal usage

---

### Milestone 10: AI Cost Attribution (Week 6)

**Goal:** Claude-powered overhead allocation with human approval

#### Tasks

**M10.1: Anthropic SDK Setup**
- [ ] Install @anthropic-ai/sdk
- [ ] Configure API key in env
- [ ] Create AIService wrapper

**M10.2: Cost Attribution Prompt**
- [ ] Define prompt template in packages/core/ai/prompts
- [ ] Include context: projects, allocation rules, historical patterns
- [ ] Request structured JSON output

**M10.3: AI Service Method**
- [ ] suggestAllocation(costCenterId, amount, projects)
- [ ] Call Claude Opus API
- [ ] Parse JSON response
- [ ] Validate output schema (Zod)
- [ ] Log to AIDecision table

**M10.4: Approval Workflow API**
- [ ] POST /api/ai/allocations/suggest (get AI suggestion)
- [ ] POST /api/ai/allocations/:decisionId/approve (create events)
- [ ] POST /api/ai/allocations/:decisionId/reject (no action)
- [ ] PATCH /api/ai/allocations/:decisionId (modify suggestion)

**M10.5: Allocation UI**
- [ ] Trigger: "Allocate Overhead" button on cost center page
- [ ] Show AI suggestion:
  - Table of allocations per project
  - Reasoning text
  - Confidence meter
- [ ] Actions: [Approve] [Adjust] [Reject]
- [ ] Adjust modal: Editable percentages (must sum to 100%)

**M10.6: Learning Loop**
- [ ] Store user modifications in AIDecision.userFeedback
- [ ] Flag decisions for prompt improvement (future)

**Acceptance Criteria:**
- ✅ AI suggests reasonable allocation (<5s)
- ✅ User can approve → Events created
- ✅ User can adjust → Modified values applied
- ✅ User can reject → No events created
- ✅ All AI decisions logged with full context
- ✅ Explanation is clear and specific

**Quality Gates:**
- AI response time P95 <5s
- Allocations sum to 100% (validation)
- Unit test: Mock Claude API, verify allocation logic
- Integration test: End-to-end approval flow

---

### Milestone 11: Testing & Quality Assurance (Week 7)

**Goal:** Comprehensive test coverage and quality checks

#### Tasks

**M11.1: Unit Test Coverage**
- [ ] packages/core: 100% coverage
- [ ] Profitability calculations
- [ ] Allocation algorithms
- [ ] Validation schemas

**M11.2: Integration Test Coverage**
- [ ] apps/api: 90% coverage
- [ ] All REST endpoints
- [ ] All GraphQL resolvers
- [ ] Database operations
- [ ] Multi-tenant isolation

**M11.3: E2E Tests (Playwright)**
- [ ] User registration & login
- [ ] Create project & first event
- [ ] View profitability dashboard
- [ ] QuickBooks connection flow
- [ ] Real-time profitability update (two-browser test)
- [ ] AI allocation approval

**M11.4: Performance Tests (k6)**
- [ ] Load test: 100 concurrent users
- [ ] Profitability query throughput
- [ ] Event creation stress test
- [ ] Target: P95 <500ms, <1% errors

**M11.5: Security Audit**
- [ ] npm audit (zero high/critical vulns)
- [ ] OWASP Top 10 checks
- [ ] Multi-tenant isolation verification
- [ ] Secrets not in code (env vars only)

**M11.6: Accessibility Audit**
- [ ] axe-core automated tests
- [ ] Keyboard navigation (all features accessible)
- [ ] Screen reader testing (basic flows)
- [ ] WCAG 2.1 Level AA compliance

**M11.7: Code Quality**
- [ ] ESLint: Zero errors
- [ ] TypeScript: Strict mode, no `any`
- [ ] Code coverage: 80% overall
- [ ] Documentation: TSDoc on public APIs

**Acceptance Criteria:**
- ✅ All tests pass (unit + integration + E2E)
- ✅ Coverage meets thresholds
- ✅ Performance targets met
- ✅ Zero high/critical security issues
- ✅ Accessibility checks pass
- ✅ Code quality metrics met

**Quality Gates:**
- CI pipeline green
- Lighthouse score >90
- Load test: 100 users, P95 <500ms
- Zero test flakiness (run 10x, all pass)

---

### Milestone 12: Deployment & Documentation (Week 8)

**Goal:** Production deployment and user-facing documentation

#### Tasks

**M12.1: Infrastructure Setup (Digital Ocean)**
- [ ] Create account, configure billing
- [ ] Provision Managed PostgreSQL (4 vCPU, 16GB RAM)
- [ ] Provision Managed Redis (2GB)
- [ ] Create Spaces bucket (file storage)
- [ ] Set up VPC, firewall rules

**M12.2: App Platform Configuration**
- [ ] Deploy apps/api (NestJS)
- [ ] Deploy apps/web (Next.js static export or SSR)
- [ ] Configure environment variables
- [ ] Set up auto-scaling (2-10 instances)

**M12.3: Database Migration**
- [ ] Run Prisma migrations in production
- [ ] Seed system data
- [ ] Configure backups (daily, 30-day retention)

**M12.4: CI/CD Pipeline**
- [ ] GitHub Actions: Build → Test → Deploy
- [ ] Staging environment (auto-deploy from main)
- [ ] Production environment (manual approval)
- [ ] Rollback procedure

**M12.5: Monitoring & Alerting**
- [ ] Datadog or Grafana setup
- [ ] Application metrics (Prometheus)
- [ ] Error tracking (Sentry)
- [ ] Uptime monitoring (Pingdom)
- [ ] PagerDuty on-call rotation

**M12.6: User Documentation**
- [ ] Getting Started guide
- [ ] QuickBooks connection guide
- [ ] FAQ (common questions)
- [ ] Video: "Create your first project"

**M12.7: API Documentation**
- [ ] Swagger UI hosted at /api/docs
- [ ] Example requests for all endpoints
- [ ] Authentication guide for developers

**M12.8: Beta Launch Preparation**
- [ ] Invite 10 beta users
- [ ] Onboarding email sequence
- [ ] Support channel (email or Slack)
- [ ] Feedback collection form

**Acceptance Criteria:**
- ✅ Production environment live and accessible
- ✅ Database backups configured and tested
- ✅ Monitoring dashboards operational
- ✅ Documentation complete and published
- ✅ Beta users can onboard successfully
- ✅ Support channels ready

**Quality Gates:**
- Production deployment completes without errors
- All health checks pass
- Monitoring alerts configured and tested
- Beta users successfully create first project

---

## Phase 1 Completion Criteria

**Technical Excellence:**
- [ ] All code merged to`main`, no long-lived branches
- [ ] 80% code coverage (overall)
- [ ] Zero high/critical security vulnerabilities
- [ ] All design docs (VISION, PRINCIPLES, etc.) reflect implementation
- [ ] Performance targets met (dashboard <2s, profitability <500ms)

**Functional Completeness:**
- [ ] User can register, create organization
- [ ] User can create projects and manual events
- [ ] User can connect QuickBooks via OAuth
- [ ] QuickBooks transactions sync automatically
- [ ] Real-time profitability updates work
- [ ] AI cost attribution with human approval
- [ ] Offline event creation (web)

**User Validation:**
- [ ] 10 beta users onboarded
- [ ] 100% beta users eliminate Excel for cost tracking
- [ ] NPS >50 (survey after 2 weeks usage)
- [ ] Zero critical bugs reported

**Operational Readiness:**
- [ ] Production environment stable (99%+ uptime)
- [ ] On-call rotation established
- [ ] Runbooks for common incidents
- [ ] Backup/restore tested

---

## Phase 2: Expansion (Weeks 9-16)

**Not implement in this phase, but planned:**

### Features
- Desktop app (Tauri)
- Mobile apps (React Native)
- Additional integrations (Toggl, Harvest, Plaid)
- Advanced AI (forecasting, anomaly detection)
- Multi-currency support
- PDF report exports

### Infrastructure
- Read replicas for scaling
- Multi-region deployment
- Enhanced caching layers

### Metrics & Goals
- 100 active users
- <2s average dashboard load (P95)
- 95% QuickBooks sync success rate

---

## Risk Mitigation

### Technical Risks

**Risk:** Third-party API downtime (QuickBooks, Claude)  
**Mitigation:** Circuit breakers, fallback mechanisms, cached responses

**Risk:** Database performance degradation at scale  
**Mitigation:** Proactive indexing, query optimization, read replicas plan

**Risk:** Sync conflicts cause data loss  
**Mitigation:** Comprehensive conflict resolution tests, user notifications

### Schedule Risks

**Risk:** Scope creep extends timeline  
**Mitigation:** Strict adherence to Phase 1 scope, defer features to Phase 2

**Risk:** Integration complexity underestimated  
**Mitigation:** QuickBooks integration in Week 5 (buffer time for debugging)

### User Adoption Risks

**Risk:** Beta users don't understand value proposition  
**Mitigation:** Clear onboarding, video tutorials, hands-on support

**Risk:** QuickBooks connection too complex for users  
**Mitigation:** Step-by-step guide, in-app tooltips, support chat

---

## Progress Tracking

**Weekly Check-ins:**
- Monday: Sprint planning, task assignment
- Wednesday: Mid-sprint sync, blockers identification
- Friday: Demo completed work, retrospective

**Metrics Dashboard:**
- Tasks completed vs planned (burndown chart)
- Test coverage trend
- Deployment frequency
- Production error rate

**Communication:**
- Slack channel for daily updates
- GitHub Projects for task tracking
- Weekly summary to stakeholders

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-03 | Initial plan for Phase 1 |
| 1.1 | TBD | Post-Sprint 2 adjustments |

---

**Next Update:** After Sprint 2 (Week 4) - reflect learnings, adjust remaining sprints
