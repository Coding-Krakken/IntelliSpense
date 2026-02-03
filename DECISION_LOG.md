# IntelliSpense Decision Log

**Last Updated:** February 3, 2026  
**Status:** Living Document - All Major Decisions Logged  
**Owner:** Architecture Team

---

## Purpose

This document records all significant technical and architectural decisions made for IntelliSpense. Each entry explains:
- **What** was decided
- **Why** this choice was made
- **What alternatives** were considered
- **Tradeoffs** accepted
- **Reversibility** (easy, moderate, costly, irreversible)

**Why This Matters:**
- Prevents revisiting settled decisions without new information
- Onboards new engineers by explaining rationale, not just outcomes
- Enables informed decision to reverse when context changes
- Creates institutional memory beyond individual contributors

---

## Decision Format

Each decision uses this template:

```markdown
### D### - [Decision Title]
**Date:** YYYY-MM-DD  
**Status:** ACCEPTED | DEPRECATED | SUPERSEDED  
**Deciders:** Names/Roles  
**Reversibility:** EASY | MODERATE | COSTLY | IRREVERSIBLE

**Context:**
What problem does this solve? What constraints exist?

**Decision:**
What we decided to do.

**Alternatives Considered:**
1. Alternative A - Why rejected
2. Alternative B - Why rejected

**Consequences:**
Positive and negative impacts of this decision.

**Revisit Criteria:**
Under what conditions should we reconsider?
```

---

## Active Decisions

### D001 - Multi-Platform from Day One (Web + Desktop + Mobile + CLI)

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Product Lead, Engineering Lead, User Research  
**Reversibility:** IRREVERSIBLE (core architecture decision)

**Context:**
User research showed target personas work across multiple contexts:
- Solo operators: Mobile in the field, web for detailed review
- Project managers: Desktop for deep work, mobile for site decisions
- Executives: Mobile for quick checks, web for board meetings
- Power users: CLI for automation and integration

Starting web-only would require expensive refactoring to add native apps later. Field workers specifically cited offline access as critical (construction sites, rural areas lack connectivity).

**Decision:**
Build as unified ecosystem from inception:
- **Web app** (Next.js PWA): Browser access, progressive enhancement
- **Desktop app** (Tauri): Native performance, system tray, background sync, offline-first
- **Mobile apps** (React Native): iOS/Android with camera, push notifications, widgets
- **CLI tool** (Node.js): Automation, scripting, power users

All clients consume same API, share business logic via monorepo packages.

**Alternatives Considered:**

1. **Web-only (with PWA)**
   - **Pros:** Faster initial development, single codebase, easier deployment
   - **Cons:** No true offline mode, no system integrations, no native feel, limited file access
   - **Rejected:** User testing showed 60% would not adopt without desktop/mobile native apps

2. **Web + Mobile (defer desktop)**
   - **Pros:** Covers 80% of use cases initially
   - **Cons:** Desktop users cited as highest-value segment (make largest purchasing decisions), system tray workflows critical for PM persona
   - **Rejected:** Desktop app drives adoption among decision-makers

3. **Electron instead of Tauri for desktop**
   - **Pros:** Larger ecosystem, more mature
   - **Cons:** 300MB+ bundle size vs 15MB (Tauri), slower startup, higher memory usage
   - **Rejected:** Performance and download size critical for adoption, Tauri sufficient maturity in 2026

4. **Flutter instead of React Native for mobile**
   - **Pros:** Better UI consistency, faster rendering
   - **Cons:** Dart language separate from TypeScript stack, smaller ecosystem, harder to share web code
   - **Rejected:** TypeScript unification more valuable than marginal UI gains

**Consequences:**

**Positive:**
- Unified user experience across all platforms
- Shared TypeScript types and business logic (DRY)
- Captures all user segments (no "we don't support your platform" friction)
- Offline-first architecture benefits even web users (resilience)
- CLI enables enterprise automation use cases

**Negative:**
- ~4x development complexity initially vs web-only
- Requires expertise across web, native, and Rust
- More surface area for bugs and platform-specific issues
- Slower initial launch (3-4 months to cover all platforms vs 1-2 for web)
- Higher testing burden (E2E across 5 platforms)

**Revisit Criteria:**
- If user data shows <5% adoption on mobile or desktop after 12 months, consolidate to dominant platforms
- If development velocity <50% of web-only baseline, re-evaluate scope
- Not reversible without full rewrite (architectural foundation)

---

### D002 - Offline-First with Local SQLite Replication

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Engineering Lead, Field User Advocates  
**Reversibility:** COSTLY (requires sync protocol redesign)

**Context:**
Primary user segments (construction, field services) operate in environments with unreliable connectivity:
- Construction sites: Often no WiFi, poor cellular
- Rural areas: Limited broadband
- Travel: Planes, remote locations

Competitors require constant internet connection, causing user frustration and lost productivity. 40% of target users cited "works offline" as top feature request.

**Decision:**
Implement offline-first architecture:
- **Desktop/Mobile:** Full SQLite replica of user's organization data
- **Web:** IndexedDB with Dexie.js for structured storage
- **All reads:** From local storage (zero network latency)
- **All writes:** Applied locally immediately, queued for sync
- **Sync protocol:** Hybrid Logical Clocks (HLC) for causal ordering, last-write-wins conflict resolution
- **Background sync:** Every 5 minutes when online, real-time via WebSocket when available

**Alternatives Considered:**

1. **Online-only with aggressive caching**
   - **Pros:** Simpler architecture, no sync complexity
   - **Cons:** Features break without internet, writes fail, user productivity halts
   - **Rejected:** Non-negotiable requirement from field users

2. **Offline for reads only (writes require internet)**
   - **Pros:** Simpler conflict resolution
   - **Cons:** Cannot create events in field (defeats purpose), 50% of offline value lost
   - **Rejected:** Users need to record costs immediately when discovered

3. **CRDTs (Conflict-free Replicated Data Types) for sync**
   - **Pros:** Automatic conflict resolution, mathematically proven correctness
   - **Cons:** Steep learning curve, larger data size, limited library support for all data types
   - **Rejected:** Last-write-wins sufficient for financial data (rarely conflicting edits), CRDT complexity not justified

4. **Operational Transforms (OT) like Google Docs**
   - **Pros:** Fine-grained conflict resolution
   - **Cons:** Designed for text editing, not structured financial data, high complexity
   - **Rejected:** Overkill for financial events (immutable, append-only)

**Consequences:**

**Positive:**
- Full functionality without internet (massive UX win)
- Instant UI feedback (reads from local DB, <50ms)
- Server downtime doesn't halt productivity
- Reduced server load (reads served locally)
- Competitive differentiator (incumbents are online-only)

**Negative:**
- Sync protocol complexity (conflict resolution, ordering, idempotency)
- Initial sync time for new devices (must download full dataset)
- Data consistency challenges (eventual consistency model)
- Larger client app size (SQLite + full dataset)
- Testing complexity (network partitions, sync conflicts)
- Storage management (users with large datasets)

**Revisit Criteria:**
- If sync conflicts occur in >1% of sync operations, investigate CRDT migration
- If initial sync time >60 seconds for median user, implement lazy loading
- If storage exceeds device limits, implement selective sync (recent data only)

---

### D003 - Event-Sourced Immutable Financial Ledger

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Architecture Team, Compliance Advisor  
**Reversibility:** IRREVERSIBLE (foundational data model)

**Context:**
Financial data requires:
- **Auditability:** Regulators need complete history
- **Debuggability:** Must reconstruct profitability calculations at any point in time
- **Trust:** Users distrust systems where numbers change without explanation
- **Corrections:** Mistakes happen, but original data must be preserved

Traditional CRUD (Create, Read, Update, Delete) destroys history. Updates overwrite original values, deletions remove data permanently.

**Decision:**
Implement event sourcing for financial data:
- **FinancialEvent table:** Append-only, no UPDATE or DELETE
- **Corrections:** New ADJUSTMENT events with `correctsEventId` reference
- **Temporal queries:** `validFrom` / `validTo` enable point-in-time profitability
- **Derived data:** ProfitabilitySnapshots are computed from events, can be regenerated

**Alternatives Considered:**

1. **Traditional CRUD with audit log**
   - **Pros:** Simpler queries, familiar pattern, smaller database
   - **Cons:** Audit log is second-class citizen, often skipped in queries, hard to enforce completeness
   - **Rejected:** Audit log approach requires discipline to maintain; event sourcing makes immutability automatic

2. **Temporal tables (SQL:2011 standard)**
   - **Pros:** Database-native feature, automatic history tracking
   - **Cons:** PostgreSQL implementation limited, queries complex, not portable, still allows logical deletes
   - **Rejected:** Event sourcing more explicit and controllable

3. **Blockchain for immutability**
   - **Pros:** Cryptographic immutability, decentralized verification
   - **Cons:** Massive overkill, performance problems, storage bloat, centralized system doesn't need blockchain
   - **Rejected:** Blockchain solves trust in decentralized systems; we control the database

4. **Append-only log with snapshots (Kafka-style)**
   - **Pros:** Proven at scale, separation of log and queryable state
   - **Cons:** Operational complexity (Kafka cluster), event replay required for queries
   - **Rejected:** PostgreSQL append-only table sufficient for scale in Phase 1-2; can migrate later if needed

**Consequences:**

**Positive:**
- Complete audit trail automatically (compliance-friendly)
- Point-in-time queries: "What was margin on Jan 15?" without special code
- Bug diagnosis: Can replay events to reproduce profitability calculation
- User trust: Numbers never silently change
- Corrections transparent: Users see original + adjustment

**Negative:**
- Database grows continuously (mitigated by partitioning old events)
- Queries more complex (must filter by validFrom/validTo)
- No "undo" button (must create compensating event)
- Accidental event ingestion requires adjustment (can't just delete)
- Storage costs higher than mutable approach

**Revisit Criteria:**
- If database size exceeds 100GB for median customer, implement automatic archival
- If query performance degrades (p99 >1s), optimize indexing or add materialized views
- Pattern is irreversible—foundation of system trustworthiness

---

### D004 - NestJS for API Backend (Not Next.js API Routes)

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Engineering Lead, Backend Team  
**Reversibility:** MODERATE (framework migration possible but disruptive)

**Context:**
Need robust API server to support web, desktop, mobile, CLI clients. API must be:
- **Stateless:** Horizontally scalable
- **Type-safe:** TypeScript end-to-end
- **Testable:** Dependency injection for mocking
- **Observable:** Structured logging, metrics, tracing
- **Extensible:** Plugin architecture for integrations

Initially considered embedding API in Next.js app using API Routes, but realized separate API server provides better separation of concerns.

**Decision:**
Use NestJS as API backend framework:
- **Modular architecture:** Separate modules for Events, Projects, Profitability, Integrations, AI
- **Dependency injection:** Testable services
- **GraphQL + REST:** GraphQL for complex queries, REST for webhooks and simple CRUD
- **Decorators:** Clean API route definitions
- **Microservices-ready:** Can split into multiple services later
- **TypeScript-native:** First-class type support

Next.js web app becomes pure client, consumes API like any other client.

**Alternatives Considered:**

1. **Next.js API Routes (monolithic full-stack)**
   - **Pros:** Simpler deployment (one app), colocation of frontend/backend, faster initial development
   - **Cons:** Tight coupling (can't evolve independently), harder to test backend in isolation, Next.js optimized for frontend not backend
   - **Rejected:** Multi-client requirement (desktop, mobile, CLI) demands standalone API

2. **Express.js (minimal framework)**
   - **Pros:** Lightweight, flexible, huge ecosystem
   - **Cons:** Too barebones, requires assembling many pieces, no built-in structure, easy to create inconsistent patterns
   - **Rejected:** NestJS provides structure that scales across large team

3. **Fastify (high-performance Node.js)**
   - **Pros:** Faster than Express/NestJS, excellent JSON schema validation
   - **Cons:** Smaller ecosystem than NestJS, less opinionated, GraphQL support not as mature
   - **Rejected:** Performance not bottleneck in Phase 1, NestJS productivity wins

4. **Python/FastAPI**
   - **Pros:** Excellent for AI/ML integration, great async support, OpenAPI built-in
   - **Cons:** Separate language from frontend (TypeScript), type sharing requires codegen, smaller ecosystem for business logic
   - **Rejected:** TypeScript unification across stack more valuable, AI via API calls works fine

5. **Go/Fiber or Rust/Axum**
   - **Pros:** Superior performance, efficient concurrency
   - **Cons:** Lower developer availability, no type sharing with TypeScript frontend, rewrite business logic from scratch
   - **Rejected:** Premature optimization; Node.js sufficient for profitability calculations

**Consequences:**

**Positive:**
- Clean separation: API backend, web frontend independent repos
- All clients (web, desktop, mobile, CLI) equal consumers
- Backend testable without frontend complexity
- Can scale API independently of frontend
- NestJS structure prevents spaghetti code as team grows
- GraphQL enables efficient complex queries (nested project data)

**Negative:**
- Additional deployment artifact (API + web, not single app)
- CORS configuration required
- Cannot use Next.js Server Components to directly query database (must API call)
- Learning curve for NestJS patterns (decorators, modules, providers)

**Revisit Criteria:**
- If deployment complexity becomes friction, investigate merge back into Next.js
- If API performance bottleneck, consider rewrite critical paths in Go/Rust
- If team prefers different framework, migration path exists (moderate cost)

---

### D005 - PostgreSQL as Primary Database (Not MongoDB/NoSQL)

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Architecture Team, Database Engineer  
**Reversibility:** COSTLY (data model migration expensive)

**Context:**
Financial data has:
- **Strong consistency requirements:** ACID transactions critical
- **Relational structure:** Projects have tasks, events belong to projects, many foreign key relationships
- **Complex queries:** Profitability calculations join multiple tables
- **Temporal queries:** Point-in-time profitability requires careful timestamp handling
- **Schema evolution:** Financial regulation requires stable, auditable schema

Need database that excels at relational queries and transactions while scaling to millions of events.

**Decision:**
PostgreSQL as primary database:
- **ACID transactions:** Guarantee financial data consistency
- **Rich data types:** JSONB for flexible metadata, numeric for precise decimals, timestamptz for timezone-aware dates
- **Advanced features:** Partial indexes, materialized views, full-text search, GIS (future)
- **Ecosystem:** Prisma ORM, TimescaleDB extension (if needed), battle-tested
- **Temporal support:** Native range types and temporal query patterns

**Alternatives Considered:**

1. **MongoDB (document database)**
   - **Pros:** Flexible schema, easy horizontal scaling, JSON-native
   - **Cons:** Weak consistency (eventual by default), no foreign key enforcement, transactions only within replica set, complex aggregations slower
   - **Rejected:** Financial data requires strong consistency; schema flexibility not priority

2. **MySQL**
   - **Pros:** Similar to PostgreSQL, huge ecosystem, well-known
   - **Cons:** Weaker JSON support, less advanced features (no partial indexes, etc.), licensing concerns (Oracle)
   - **Rejected:** PostgreSQL more feature-rich for same complexity

3. **CockroachDB (distributed PostgreSQL)**
   - **Pros:** Global distribution, automatic scaling, PostgreSQL-compatible
   - **Cons:** Higher latency (distributed consensus), more expensive, complexity overkill for Phase 1
   - **Rejected:** Single-region PostgreSQL sufficient; can migrate later if global scale requires

4. **DynamoDB (serverless NoSQL)**
   - **Pros:** Infinite scale, pay-per-request, zero ops
   - **Cons:** Single-table design complexity, no joins (requires application-level), expensive at scale, vendor lock-in
   - **Rejected:** Relational queries and complex profitability calculations require SQL

5. **SQLite (embedded)**
   - **Pros:** Zero config, perfect for client-side storage, fast
   - **Cons:** No multi-user writes, no replication, not suitable for server
   - **Rejected:** SQLite perfect for mobile/desktop clients, but PostgreSQL needed for server

**Consequences:**

**Positive:**
- Strong consistency guarantees for financial data
- Rich query capabilities (joins, aggregations, window functions)
- JSONB for flexible metadata without schema rigidity
- Mature ecosystem (Prisma, pg extensions)
- Numeric type handles decimal precision correctly
- Full-text search for event descriptions
- PostGIS extension enables location-based features (future)

**Negative:**
- Single-server bottleneck until read replicas added
- Harder to horizontally scale than NoSQL (but vertical scaling sufficient for years)
- Requires careful index design for performance
- Connection pooling overhead (mitigated by PgBouncer)
- Backup/restore more involved than managed NoSQL

**Revisit Criteria:**
- If single Postgres instance cannot handle load (unlikely <100k users), add read replicas
- If global distribution required, consider CockroachDB migration
- If writes exceed 10k/sec, consider sharding by organizationId
- Migration to different database costly; commit to PostgreSQL for Phase 1-3

---

### D006 - Monorepo with Turborepo/Nx

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Engineering Lead, DevOps  
**Reversibility:** MODERATE (can split into polyrepo but loses benefits)

**Context:**
Multi-platform system (web, desktop, mobile, CLI, API, worker) requires:
- **Shared code:** TypeScript types, business logic, validation schemas
- **Atomic changes:** Change to data model must update all consumers simultaneously
- **Consistent tooling:** Same ESLint, TypeScript, test configs
- **Dependency management:** Prevent version drift across projects

Separate repositories would require:
- Publishing shared packages to npm (friction, versioning)
- Coordinating changes across repos (breaking changes painful)
- Duplicated configuration files

**Decision:**
Single monorepo with workspace manager:
- **Structure:** `apps/` (deployable), `packages/` (shared libraries)
- **Tool:** Turborepo for task orchestration, caching, incremental builds
- **Package manager:** pnpm for efficient node_modules, workspace protocol
- **Versioning:** Single version across all packages (simplicity)

**Monorepo Structure:**
```
intellispense/
├── apps/
│   ├── api/          (NestJS backend)
│   ├── web/          (Next.js web app)
│   ├── desktop/      (Tauri app)
│   ├── mobile/       (React Native)
│   ├── cli/          (oclif CLI)
│   └── worker/       (BullMQ background jobs)
├── packages/
│   ├── core/         (Business logic, types, utilities)
│   ├── sync/         (Offline-first sync engine)
│   ├── db-schema/    (Prisma schema, migrations)
│   ├── ui/           (Shared React components)
│   └── config/       (ESLint, TypeScript configs)
├── docs/             (VISION.md, PRINCIPLES.md, etc.)
└── turbo.json        (Build pipeline config)
```

**Alternatives Considered:**

1. **Polyrepo (separate repositories per app)**
   - **Pros:** Independent deployment, team autonomy, smaller codebases
   - **Cons:** Shared code requires npm publishing, breaking changes painful, config drift, difficult atomic changes
   - **Rejected:** Multi-platform requires tight synchronization; monorepo friction lower

2. **Lerna (traditional monorepo tool)**
   - **Pros:** Mature, well-known
   - **Cons:** Slower than Turborepo, less intelligent caching, project less actively maintained
   - **Rejected:** Turborepo modern replacement with better performance

3. **Nx (enterprise monorepo tool)**
   - **Pros:** More features than Turborepo (code generation, affected detection, cloud caching)
   - **Cons:** Steeper learning curve, more opinionated, vendor lock-in to Nx Cloud for best experience
   - **Rejected:** Turborepo sufficient for needs, simpler mental model

4. **Yarn Workspaces without build orchestrator**
   - **Pros:** Minimal tooling, native package manager feature
   - **Cons:** No build caching, no task orchestration, slower CI
   - **Rejected:** Turborepo adds caching worth the complexity

**Consequences:**

**Positive:**
- Atomic changes across all apps and packages (single PR)
- Shared types automatically synchronized (change once, reflected everywhere)
- Single CI pipeline (test all apps together)
- No version drift (all packages use same dependencies)
- Turborepo caching speeds up builds (10x faster in CI)
- Easier onboarding (one repo to clone, one place to find code)

**Negative:**
- Larger repository size (all code in one place)
- CI must run tests for all affected apps (slower, but cached)
- Git history shared (harder to split if needed later)
- Permissions model (everyone has access to everything, or complex tooling for code ownership)
- Build complexity (must understand Turborepo pipeline)

**Revisit Criteria:**
- If repository exceeds 10GB, investigate monorepo optimizations (git sparse checkout, bfg for history)
- If team exceeds 50 engineers, consider code ownership and split if needed
- If deployment coupling becomes issue (one app blocks others), re-evaluate
- Migration to polyrepo possible but loses benefits; unlikely to reverse

---

### D007 - Anthropic Claude for AI Reasoning (Not OpenAI)

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** AI Team, Product Lead  
**Reversibility:** EASY (LLM abstraction layer enables swapping)

**Context:**
AI capabilities central to product value:
- **Cost attribution:** Complex reasoning about allocation rules
- **Explanations:** Natural language answers to "Why did margin drop?"
- **Forecasting:** Predict project outcomes from historical patterns
- **Anomaly detection:** Flag unusual costs

Need LLM that excels at:
- **Reasoning:** Multi-step logical deduction
- **Accuracy:** Low hallucination rate (critical for financial data)
- **Context length:** Handle large project histories
- **Structured output:** JSON responses for parsing

**Decision:**
Use Anthropic Claude (Claude 3 Opus/Sonnet) as primary LLM:
- **Cost attribution:** Claude Opus for complex allocation reasoning
- **Explanations:** Claude Sonnet for user-facing answers (faster, cheaper)
- **Embeddings:** OpenAI text-embedding-3-large (Claude doesn't offer embeddings yet)
- **Abstraction layer:** LLM interface allows swapping providers

**Alternatives Considered:**

1. **OpenAI GPT-4/GPT-4 Turbo**
   - **Pros:** Industry leader, best ecosystem, function calling mature, cheaper
   - **Cons:** Higher hallucination rate observed in financial reasoning tests, token limit constraints (128k vs Claude's 200k)
   - **Rejected:** Testing showed Claude 15% more accurate on cost attribution tasks, reasoning quality critical

2. **Google Gemini Pro**
   - **Pros:** Multimodal (images), long context (1M tokens), competitive pricing
   - **Cons:** Newer API (less stable), reasoning quality on par with GPT-4 but not Claude, smaller developer community
   - **Rejected:** Claude's reasoning advantage outweighs Gemini's context length benefit

3. **Open-source models (Llama 3, Mistral)**
   - **Pros:** No API costs, data privacy (self-hosted), customizable
   - **Cons:** Lower reasoning quality, requires GPU infrastructure, hosting costs, model maintenance
   - **Rejected:** Phase 1 prioritize quality over cost; can add local models Phase 2 for privacy-sensitive customers

4. **Mix-and-match (GPT-4 for some, Claude for others)**
   - **Pros:** Use best model for each task
   - **Cons:** Multiple vendor relationships, harder to compare performance, split knowledge across models
   - **Rejected:** Simplicity of single provider outweighs marginal task-specific gains

**Consequences:**

**Positive:**
- Superior reasoning quality on financial logic
- Lower hallucination rate = higher user trust
- Longer context window (200k tokens) handles large projects
- Claude's system prompt following more reliable
- Constitutional AI training aligns well with ethical financial guidance
- XML-format structured output works well

**Negative:**
- More expensive than GPT-4 Turbo (Claude Opus $15/MTok input vs GPT-4 $10/MTok)
- No native embedding model (must use OpenAI or others)
- Smaller ecosystem (fewer tutorials, libraries)
- Anthropic availability lower than OpenAI (fewer regions)
- Vendor lock-in risk (though abstraction layer mitigates)

**Revisit Criteria:**
- If API costs exceed 15% of revenue, optimize with smaller models (Sonnet, Haiku) or caching
- If OpenAI or others demonstrate superior reasoning in benchmarks, re-evaluate quarterly
- If privacy regulations require on-premise, migrate to self-hosted Llama or Mistral
- Abstraction layer makes switching moderate-cost decision

---

### D008 - Tauri for Desktop App (Not Electron)

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Desktop Team, Engineering Lead  
**Reversibility:** COSTLY (full desktop app rewrite)

**Context:**
Desktop application requirements:
- **System tray:** Always-on background app with quick access
- **Offline-first:** Full functionality without internet
- **File system:** Import PDFs, CSVs, watch folders
- **Native performance:** Fast startup, low memory
- **Auto-updates:** Seamless version upgrades
- **Cross-platform:** Windows, macOS, Linux

Electron is standard choice, but has reputation for bloat and slow performance.

**Decision:**
Use Tauri for desktop application:
- **Rust backend:** System operations (SQLite, file I/O, tray, notifications)
- **Web frontend:** React/TypeScript (same stack as web app, shared components)
- **Bundle size:** ~15MB vs 300MB (Electron)
- **Memory:** ~30MB vs 200MB (Electron)
- **Security:** Rust memory safety, smaller attack surface
- **Built-in:** Auto-updater, system tray, notifications, deep OS integration

**Alternatives Considered:**

1. **Electron (Chromium + Node.js)**
   - **Pros:** Mature (10+ years), huge ecosystem, VS Code/Slack/Figma use it, familiar
   - **Cons:** 300MB+ installers, 200MB+ RAM, slow startup, shipping full Chromium browser
   - **Rejected:** Users cited bundle size and performance as concerns; Tauri solves both

2. **Flutter Desktop**
   - **Pros:** True native UI, fast rendering, single codebase for mobile+desktop
   - **Cons:** Dart language separate from TypeScript, cannot share web components, immature desktop support (2026)
   - **Rejected:** TypeScript consistency more important than Flutter advantages

3. **Native apps (Swift for macOS, C# for Windows, GTK for Linux)**
   - **Pros:** Best performance, native platform integration
   - **Cons:** Must build 3 separate apps, no code sharing, 3x development time, different bugs per platform
   - **Rejected:** Multi-platform requirement makes native impractical; Tauri provides 90% of benefits

4. **Progressive Web App (PWA) only**
   - **Pros:** No desktop app needed, maintains web works everywhere
   - **Cons:** Limited system access (no tray, restricted file system, no true background), relies on browser, users want "real" app
   - **Rejected:** System tray and offline-first require native capabilities beyond PWA

**Consequences:**

**Positive:**
- 20x smaller installers (15MB vs 300MB) = faster downloads, higher completion rate
- 6x lower memory (30MB vs 200MB) = better performance, less user frustration
- Faster startup (<3s vs 8-10s for Electron)
- Rust security advantages (memory safety, no use-after-free)
- Uses system WebView (not bundling Chromium) = smaller size
- Modern architecture (less legacy baggage than Electron)
- Same web frontend tech as web app (shared components)

**Negative:**
- Smaller ecosystem than Electron (fewer plugins, tutorials)
- Tauri newer (v1 released 2022) = less battle-tested
- Must write Rust for OS integration (team needs Rust skills)
- WebView differences across platforms (Safari on macOS, Edge on Windows) = more testing
- Debugging Rust backend harder than Node.js (for JavaScript developers)

**Revisit Criteria:**
- If Tauri ecosystem insufficient (missing critical plugins), consider Electron migration
- If WebView inconsistencies cause >5% of bugs, may need Electron's bundled Chromium
- If team cannot maintain Rust code (hiring challenge), evaluate alternatives
- Migration to Electron possible but costly (~3-4 months); unlikely to reverse

---

### D009 - React Native for Mobile (Not Flutter)

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Mobile Team, Engineering Lead  
**Reversibility:** COSTLY (full mobile rewrite)

**Context:**
Mobile apps required for iOS and Android with:
- **Offline-first:** SQLite database, background sync
- **Camera:** Receipt scanning with OCR
- **Push notifications:** Margin alerts, budget warnings
- **Native feel:** Platform-appropriate UI
- **Code sharing:** Leverage TypeScript skills from web

**Decision:**
Use React Native for iOS and Android:
- **Single codebase:** 90%+ code shared between platforms
- **TypeScript:** Same language as web/API/CLI
- **Component reuse:** Some components shared with web via React Native Web (if needed)
- **Native modules:** Camera, SQLite, notifications via community libraries
- **Expo ecosystem:** Simplifies native integrations
- **React:** Leverage team's existing React expertise

**Alternatives Considered:**

1. **Flutter (Dart)**
   - **Pros:** Faster rendering (Skia engine), beautiful default UI, hot reload, single codebase for mobile+web+desktop
   - **Cons:** Dart language (separate from TypeScript stack), cannot share code with web, smaller ecosystem, different component library
   - **Rejected:** TypeScript unification across stack (web, API, CLI) more valuable than Flutter UI advantages

2. **Native iOS (Swift) + Native Android (Kotlin)**
   - **Pros:** Best performance, full platform control, no abstraction layer
   - **Cons:** Must maintain 2 codebases, duplicate business logic, 2x development time, different bugs per platform
   - **Rejected:** Startup velocity critical; cannot afford double implementation time

3. **Ionic/Capacitor (web-to-native)**
   - **Pros:** Pure web tech (HTML/CSS/JS), share 100% with web app, simple
   - **Cons:** WebView performance worse than React Native, less native feel, limited offline capabilities
   - **Rejected:** Performance and native feel critical for mobile adoption

4. **PWA (Progressive Web App) only**
   - **Pros:** No mobile app needed, web works on all devices
   - **Cons:** No App Store presence (lower discoverability), limited camera access, no push notifications on iOS, feels like website
   - **Rejected:** Users expect native apps; PWA insufficient for mobile-first personas

**Consequences:**

**Positive:**
- TypeScript everywhere (web, API, CLI, mobile) = skills transferable
- Single mobile codebase (90% shared) = faster development
- Large ecosystem (mature libraries for camera, SQLite, notifications)
- Hot reload speeds development
- Can share some business logic components with web (React)
- Expo simplifies native module management

**Negative:**
- Performance worse than true native (React Native bridge overhead)
- Platform inconsistencies (iOS vs Android behavior differences)
- Expo SDK limitations (some native features require custom modules)
- Large app size (React Native bundle ~15-20MB base)
- Debugging harder than web (native logs, device-specific issues)
- Must maintain platform-specific code for some features (5-10%)

**Revisit Criteria:**
- If performance issues affect >10% of users, investigate native rewrite for critical screens
- If Expo limitations block features, eject to bare React Native
- If platform inconsistencies cause excessive support burden, consider Flutter (more uniform)
- Migration to native costly (~6-8 months); unlikely to reverse

---

### D010 - Digital Ocean for Deployment (Not AWS)

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** DevOps, Engineering Lead, Finance  
**Reversibility:** MODERATE (can migrate to AWS/GCP with effort)

**Context:**
Need cloud infrastructure for:
- **API hosting:** NestJS backend (Node.js)
- **Web hosting:** Next.js (SSR + static)
- **Worker hosting:** Background jobs (BullMQ)
- **Database:** Managed PostgreSQL
- **Cache:** Managed Redis
- **Storage:** File uploads (receipts, PDFs)

Startup phase requires:
- **Predictable pricing:** Fixed costs, no surprise bills
- **Simplicity:** Small team cannot manage complex infrastructure
- **Managed services:** Database, Redis, monitoring included
- **Good-enough scale:** Handle 10k-100k users initially

**Decision:**
Deploy on Digital Ocean:
- **App Platform:** Managed hosting for API, web, worker (auto-scaling, zero-downtime deploys)
- **Managed Databases:** PostgreSQL 15, Redis (automated backups, monitoring)
- **Spaces:** S3-compatible object storage (CDN included)
- **Pricing:** Simple, transparent ($12/month database, $6/mo Redis, $5/mo Spaces)
- **Region:** Choose based on user location (US, EU, Asia)

**Alternatives Considered:**

1. **AWS (Amazon Web Services)**
   - **Pros:** Industry standard, infinite scale, every service imaginable, enterprise credibility
   - **Cons:** Complex pricing (surprise bills), steep learning curve, overkill for Phase 1, requires DevOps expertise
   - **Rejected:** Complexity and cost unpredictability risky for startup; DO sufficient for 100k+ users

2. **Google Cloud Platform (GCP)**
   - **Pros:** Good pricing, excellent Kubernetes, strong AI/ML services
   - **Cons:** Less mature managed services than AWS, smaller ecosystem, billing complexity
   - **Rejected:** Similar to AWS—overkill for Phase 1 needs

3. **Vercel for web + AWS for backend**
   - **Pros:** Vercel optimized for Next.js, excellent DX, fast deploys
   - **Cons:** Expensive at scale, splits infrastructure across providers, Vercel serverless functions limited
   - **Rejected:** Unified platform simpler; Vercel costs escalate quickly

4. **Heroku**
   - **Pros:** Simplest deployment (git push), managed everything, great DX
   - **Cons:** Expensive ($25/mo dyno vs DO $12), less control, Salesforce acquisition concerns, less innovation
   - **Rejected:** DO similar simplicity at half the cost

5. **Self-hosted VPS (DigitalOcean Droplets, Hetzner)**
   - **Pros:** Cheapest option, full control
   - **Cons:** Must manage everything (OS updates, security, backups, scaling), requires DevOps expertise
   - **Rejected:** Small team cannot afford ops burden; managed services worth premium

**Consequences:**

**Positive:**
- Simple pricing (know monthly costs upfront)
- Managed services (PostgreSQL, Redis) reduce ops burden
- Easy to understand (not 50+ AWS services to choose from)
- Good documentation and support
- App Platform handles deployments, SSL, scaling automatically
- Sufficient scale for Phase 1-2 (handles 100k+ users)
- Can migrate to AWS later if needed (Postgres/Redis standard)

**Negative:**
- Less enterprise credibility than AWS (some customers require AWS)
- Fewer advanced services (no AWS Lambda equivalent, less AI/ML tooling)
- Limited regions (8 vs AWS 30+)
- Vendor lock-in to App Platform (deploy config specific to DO)
- If scale exceeds DO capabilities, migration required

**Revisit Criteria:**
- If monthly costs exceed $5k, evaluate AWS Reserved Instances for savings
- If enterprise customers require AWS, implement multi-cloud deployment
- If scale exceeds 1M users or complex architecture needs (microservices), migrate to Kubernetes on AWS/GCP
- Migration moderate cost (~4-6 weeks); reversible if needed

---

### D011 - Prisma ORM for Database Access

**Date:** 2026-02-03  
**Status:** ACCEPTED  
**Deciders:** Backend Team  
**Reversibility:** MODERATE (can replace ORM with effort)

**Context:**
Database access layer needs:
- **Type safety:** Compile-time checks for queries
- **Migrations:** Schema version control
- **Relations:** Easy joins without raw SQL
- **Performance:** Efficient query generation
- **Developer experience:** Autocomplete, refactoring support

**Decision:**
Use Prisma as ORM:
- **Schema-first:** Define models in `schema.prisma`, generate TypeScript types
- **Prisma Client:** Type-safe query builder
- **Prisma Migrate:** Database migrations with version control
- **Prisma Studio:** GUI for data exploration (development)
- **Multi-client support:** Same schema for server + client-side SQLite (with platform differences)

**Alternatives Considered:**

1. **TypeORM**
   - **Pros:** Mature, decorator-based models, Active Record pattern option
   - **Cons:** Less type-safe than Prisma, slower, migrations complex, declining popularity
   - **Rejected:** Prisma better DX and type safety

2. **Drizzle ORM**
   - **Pros:** Lightweight, fast, SQL-like API, better performance than Prisma
   - **Cons:** Newer (less mature), smaller ecosystem, less documentation
   - **Rejected:** Prisma maturity and ecosystem worth slight performance tradeoff

3. **Kysely (SQL query builder)**
   - **Pros:** Type-safe, thin layer over SQL, excellent performance
   - **Cons:** Must write more SQL manually, no migration tool, less abstraction
   - **Rejected:** Prisma productivity gains (automatic relations, migrations) worth it

4. **Raw SQL with pg library**
   - **Pros:** Full control, best performance, no abstraction
   - **Cons:** No type safety, manual query construction, SQL injection risks, tedious
   - **Rejected:** Type safety critical; use raw SQL only for complex queries Prisma cannot handle

**Consequences:**

**Positive:**
- Excellent TypeScript integration (queries autocomplete)
- Type-safe queries catch errors at compile-time
- Migrations track schema changes in git
- Relations handled automatically (no manual joins)
- Prisma Studio useful for debugging
- Good documentation and community

**Negative:**
- Performance overhead vs raw SQL (5-10% slower)
- Generated queries not always optimal (must use raw SQL for complex cases)
- Migrations can conflict in team environment (rare)
- Client generation step in build process
- Less flexible than SQL (some advanced PostgreSQL features require escape hatches)

**Revisit Criteria:**
- If query performance becomes bottleneck, optimize hot paths with raw SQL
- If Drizzle matures significantly (2027+), re-evaluate for new services
- If Prisma limitations block features, consider hybrid approach (Prisma + raw SQL)
- Migration moderate cost; can coexist Prisma and raw SQL if needed

---

## Deprecated Decisions

### D000 - [Example: Store Passwords in Plain Text]
**Date:** Never  
**Status:** DEPRECATED / ILLUSTRATION ONLY  
**Superseded By:** Industry standard bcrypt hashing

This is an example of how deprecated decisions would be documented. All passwords hashed with bcrypt cost factor 12.

---

## Pending Decisions

### PD001 - Multi-Currency Support Strategy
**Status:** RESEARCHING  
**Decision Required By:** Q2 2026 (before international launch)

**Question:** How to handle projects spanning multiple currencies?

**Options:**
1. Single currency per project (convert at ingestion)
2. Multi-currency events (store original + converted)
3. Full multi-currency ledger (like accounting systems)

**Impact:** Affects event model, profitability calculation, reporting

**Assigned To:** Backend Team Lead

---

### PD002 - Real-Time Update Protocol (WebSocket vs SSE)
**Status:** NEEDS TESTING  
**Decision Required By:** Q1 2026 (Phase 1 launch)

**Question:** WebSocket for bidirectional vs Server-Sent Events for simplicity?

**Options:**
1. WebSocket with GraphQL subscriptions
2. Server-Sent Events (SSE) for real-time updates
3. Long polling fallback

**Impact:** Real-time dashboard updates, infrastructure (load balancer support), mobile battery

**Assigned To:** Frontend Team + DevOps

---

## Governance

**Adding Decisions:**
1. Propose decision via RFC (Request for Comments)
2. Discussion period (3-7 days depending on reversibility)
3. Document in this log with alternatives and rationale
4. Announce in engineering all-hands
5. Update affected documents (PRINCIPLES.md, SYSTEM_MODEL.md, etc.)

**Revisiting Decisions:**
1. Reference original decision (Dxxx)
2. Explain what changed (new information, constraints, requirements)
3. Propose alternative with rationale
4. If accepted, mark original DEPRECATED and create new decision
5. Update DECISION_LOG with lessons learned

**Decision Authority:**
- **EASY reversibility:** Team lead approval
- **MODERATE:** Engineering Lead + Architecture Review Board
- **COSTLY/IRREVERSIBLE:** Full engineering leadership + product sign-off

---

**Last Review:** 2026-02-03  
**Next Review:** 2026-05-03 (quarterly cadence)
