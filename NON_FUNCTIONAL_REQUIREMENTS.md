# IntelliSpense Non-Functional Requirements

**Last Updated:** February 3, 2026  
**Status:** Engineering Constraints & Service Level Objectives  
**Owner:** Engineering Lead + SRE Team

---

## Purpose

This document defines **non-functional requirements (NFRs)** - the quality attributes that constrain how IntelliSpense must behave beyond its functional capabilities.

**Categories:**
- Performance & Scalability
- Availability & Reliability
- Security & Privacy
- Observability & Monitoring
- Compliance & Auditability
- Usability & Accessibility
- Maintainability & Extensibility
- Operational Requirements

**These are not aspirations—these are contracts.**  
Every requirement includes measurable criteria and enforcement mechanisms.

---

## Performance Requirements

### Response Time Targets

| Operation | P50 | P95 | P99 | Max Timeout | Notes |
|-----------|-----|-----|-----|-------------|-------|
| **Dashboard Initial Load** | 800ms | 1.5s | 2.5s | 5s | Includes cache warm-up |
| **Project List Query** | 150ms | 300ms | 600ms | 2s | Up to 100 projects |
| **Profitability Calculation** | 100ms | 300ms | 500ms | 2s | Single project, <10k events |
| **Event Creation** | 50ms | 150ms | 300ms | 1s | Includes validation & persist |
| **Event Query (filtered)** | 100ms | 250ms | 500ms | 2s | Up to 1000 results |
| **AI Cost Attribution** | 2s | 5s | 8s | 15s | Claude API call + processing |
| **AI Explanation** | 1.5s | 4s | 7s | 12s | Claude API + context retrieval |
| **Real-Time Update Delivery** | 500ms | 2s | 4s | 10s | Event ingestion → WebSocket push |
| **Sync (1000 events)** | 3s | 8s | 15s | 30s | Client → server push |
| **QuickBooks Sync (100 txns)** | 5s | 15s | 30s | 60s | External API latency |
| **Report Generation (PDF)** | 2s | 6s | 12s | 30s | Complex multi-project report |
| **Full Data Export** | 5s | 15s | 45s | 300s | CSV/JSON of entire org |

**Enforcement:**
- Synthetic monitoring alerts if P95 exceeds target
- Transaction traces for all requests >P99
- Automatic slow query logging (Postgres >500ms)

**Performance Budget:**
- Web bundle size: <500KB (gzipped JavaScript)
- Desktop app: Launch in <3s | Memory <100MB
- Mobile app: Launch in <2s | Memory <80MB

---

### Throughput Requirements

| Metric | Target | Burst | Notes |
|--------|--------|-------|-------|
| **API Requests** | 1,000 req/s sustained | 5,000 req/s for 60s | Per region |
| **Event Ingestion** | 500 events/s | 2,000 events/s for 60s | System-wide |
| **WebSocket Connections** | 10,000 concurrent | 25,000 peak | With connection pooling |
| **Database Writes** | 1,000 writes/s | 5,000 writes/s burst | PostgreSQL limit |
| **Database Reads** | 10,000 reads/s | 50,000 reads/s | With read replicas |
| **Background Jobs** | 100 jobs/min | 500 jobs/min peak | BullMQ workers |

**Scaling Strategy:**
- Horizontal: API servers auto-scale 2-20 instances
- Vertical: Database scales to 16 vCPU, 64GB RAM
- Caching: Redis handles 90% of profitability queries
- CDN: Static assets served from edge (Cloudflare/DO CDN)

---

### Data Volume Targets

| Data Type | Year 1 | Year 3 | Year 5 | Notes |
|-----------|--------|--------|--------|-------|
| **Organizations** | 10,000 | 100,000 | 1,000,000 | Active paying customers |
| **Users** | 30,000 | 500,000 | 5,000,000 | Avg 3-5 users per org |
| **Projects** | 50,000 | 1,000,000 | 10,000,000 | Avg 5 projects/org |
| **Financial Events** | 5M | 500M | 10B | Critical path: query optimization |
| **Database Size** | 50GB | 2TB | 50TB | PostgreSQL + indexes |
| **File Storage** | 100GB | 10TB | 500TB | Receipts, invoices, PDFs |

**Database Design for Scale:**
- Table partitioning: FinancialEvent partitioned by timestamp (monthly)
- Indexing strategy: Composite indexes on (organizationId, projectId, timestamp)
- Archival: Events >2 years moved to cold storage, queryable on-demand
- Compression: PostgreSQL TOAST for large JSONB fields

---

## Availability & Reliability Requirements

### Uptime Targets (SLA)

| Component | Target | Max Downtime/Month | Max Downtime/Year | Notes |
|-----------|--------|-------------------|-------------------|-------|
| **API** | 99.9% | 43.8 minutes | 8.76 hours | Excludes planned maintenance |
| **Web App** | 99.5% | 3.6 hours | 43.8 hours | Static hosting + API dependency |
| **Database** | 99.95% | 21.9 minutes | 4.38 hours | Managed PostgreSQL SLA |
| **Real-Time Updates** | 99.0% | 7.2 hours | 87.6 hours | WebSocket connections (degrades to polling) |
| **Integrations (syncs)** | 95.0% | 36 hours | 18.3 days | Dependent on third-party APIs |

**Planned Maintenance Windows:**
- Weekly: Sunday 2-4 AM UTC (database backups, migrations)
- Monthly: First Sunday 1-3 AM UTC (platform updates)
- User notifications: 7 days advance for breaking changes

**Disaster Recovery:**
- **RTO (Recovery Time Objective):** 4 hours
- **RPO (Recovery Point Objective):** 5 minutes (burst, point-in-time recovery)
- **Geographic Redundancy:** Multi-region backups (US, EU)
- **Backup Frequency:** 
  - Database: Continuous WAL archiving + daily full backup
  - File storage: Daily snapshots, retained 30 days

---

### Failure Modes & Handling

| Failure Scenario | Detection Time | Recovery | User Impact |
|-----------------|----------------|----------|-------------|
| **API server crash** | <30s (healthcheck) | Auto-restart, fallback to other instances | None (load balanced) |
| **Database connection pool exhausted** | <10s (metrics spike) | Scale connections, reject excess | Some requests 503, retry succeeds |
| **Redis cache failure** | <10s | Bypass cache, query database | Slower responses (degraded) |
| **WebSocket server down** | <30s | Fallback to HTTP polling | Real-time updates delayed 30-60s |
| **Integration API timeout** | Immediate | Queue for retry, exponential backoff | Sync delayed, notification sent |
| **AI API (Claude) unavailable** | <5s (timeout) | Cache last response or use rule-based fallback | Degraded explanation quality |
| **Disk space full** | <5 min (alert) | Archive old data, emergency expansion | Writes fail, reads continue |

**Circuit Breakers:**
- External APIs: Open circuit after 5 consecutive failures, half-open after 60s
- Database: Connection retry with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- AI services: Timeout after 15s, use cached response if available

---

### Data Durability

| Data Type | Durability Target | Backup Strategy | Retention |
|-----------|------------------|-----------------|-----------|
| **Financial Events** | 99.9999999% (11 nines) | PostgreSQL replicas + WAL archiving + daily snapshots | 7 years (compliance) |
| **User Data** | 99.999999% (8 nines) | Daily backups, geo-redundant | Until account deletion + 30 days |
| **Profitability Cache** | 99% (ephemeral) | No backups (recalculatable) | TTL 1 hour |
| **File Uploads** | 99.99999% (7 nines) | Spaces/S3 with versioning | 7 years |
| **Audit Logs** | 99.999999% (8 nines) | Immutable, append-only, archived | 7 years |

**Backup Testing:**
- Monthly: Restore database from backup to staging (verify integrity)
- Quarterly: Full disaster recovery drill (restore production to empty environment)

---

## Security Requirements

### Authentication & Authorization

**Requirements:**

1. **Password Policy**
   - Minimum 12 characters
   - Must include uppercase, lowercase, number, special char
   - Cannot be in breach database (HaveIBeenPwned API check)
   - Bcrypt hashing with cost factor 12
   - No password reuse (last 5 passwords)

2. **Multi-Factor Authentication (MFA)**
   - Required for: OWNER, ADMIN roles
   - Optional for: All other users
   - Methods: TOTP (Google Authenticator), SMS (Twilio)
   - Backup codes: 10 generated at MFA setup

3. **Session Management**
   - Access tokens: JWT, 15-minute expiry
   - Refresh tokens: 30-day expiry, single-use, rotated
   - Concurrent sessions: Max 5 per user
   - Forced logout: On password change, MFA disable, role change

4. **OAuth/SSO (Enterprise)**
   - Protocols: SAML 2.0, OIDC (OpenID Connect)
   - Providers: Okta, Azure AD, Google Workspace
   - Just-in-Time (JIT) provisioning: Auto-create users on first login
   - SCIM: User provisioning and deprovisioning

5. **Authorization Model**
   - Row-Level Security: All queries filtered by `organizationId`
   - Permission checks: Every API endpoint before data access
   - Principle of Least Privilege: Default VIEWER role for new users
   - Permission delegation: Temporary elevated access with expiry

**Enforcement:**
- Authentication middleware on all API routes (except public health check)
- Database views enforce org isolation (no raw table access)
- Audit log records all authentication events

---

### Data Encryption

| Data State | Method | Key Management | Notes |
|------------|--------|----------------|-------|
| **At Rest (DB)** | AES-256 (TDE) | PostgreSQL managed encryption | Digital Ocean Managed DB feature |
| **At Rest (Files)** | AES-256 | DO Spaces server-side encryption | Automatic, transparent |
| **At Rest (Backups)** | AES-256 | Encrypted before upload | Additional layer beyond DB encryption |
| **In Transit (API)** | TLS 1.3 | Let's Encrypt certs, auto-renew | HSTS enforced, no HTTP |
| **In Transit (DB)** | TLS 1.2+ | Client certificates for admins | Encrypted connections required |
| **Client-Side (Mobile/Desktop)** | AES-256 (SQLCipher) | Device keychain | Local SQLite databases encrypted |
| **PII/Sensitive Fields** | Application-level AES-256 | Vault (HashiCorp) or KMS | OAuth tokens, API keys |

**Key Rotation:**
- Database encryption keys: Annually (managed by DO)
- Application secrets: Quarterly or on suspected compromise
- TLS certificates: Auto-renewal 30 days before expiry

---

### Vulnerability Management

**Processes:**

1. **Dependency Scanning**
   - Automated: npm audit, Snyk, Dependabot
   - Frequency: Daily in CI/CD
   - Action: Block merge if critical/high vulnerabilities
   - Remediation SLA: 
     - Critical: 24 hours
     - High: 7 days
     - Medium: 30 days

2. **Code Security**
   - Static Analysis: SonarQube, ESLint security plugins
   - Secrets Detection: GitGuardian (prevent credential commits)
   - Code Review: Security checklist for all PRs touching auth/payments/data

3. **Infrastructure Security**
   - OS Patching: Managed by Digital Ocean (auto-updates)
   - Container Scanning: Trivy for Docker images
   - Kubernetes (future): Admission controllers, network policies

4. **Penetration Testing**
   - Internal: Quarterly using automated tools (OWASP ZAP)
   - External: Annual engagement with security firm
   - Scope: API, web app, authentication flows
   - Remediation: All findings addressed before next release

**Incident Response:**
- **Detection:** SIEM alerts (Datadog Security Monitoring)
- **Response Time:** 
  - Critical breach: 1 hour acknowledgement
  - High risk: 4 hours
  - Medium: 24 hours
- **Communication:** Affected users notified within 72 hours (GDPR requirement)

---

### API Security

**Rate Limiting:**

| Endpoint Type | Anonymous | Authenticated | Enterprise |
|--------------|-----------|---------------|-----------|
| **Public (no auth)** | 10 req/min | N/A | N/A |
| **Read APIs** | N/A | 100 req/min | 1,000 req/min |
| **Write APIs** | N/A | 60 req/min | 500 req/min |
| **AI APIs** | N/A | 20 req/min | 100 req/min |
| **Exports** | N/A | 5 req/hour | 30 req/hour |

Exceeded limits: HTTP 429 with Retry-After header

**Input Validation:**
- Schema validation: Zod for all API inputs
- SQL Injection: Parameterized queries only (Prisma ORM)
- XSS: Content Security Policy (CSP), output escaping
- CSRF: SameSite cookies, CSRF tokens for mutations
- File uploads: 
  - Max size: 50MB
  - Allowed types: PDF, PNG, JPG, CSV, XLSX
  - Virus scanning: ClamAV before storage

**API Authentication:**
- Header: `Authorization: Bearer <jwt>`
- Validation: Signature verification, expiry check, revocation list
- Logging: All failed auth attempts (detect brute force)

---

## Observability & Monitoring

### Logging Requirements

**Log Levels:**
- **ERROR:** Immediate attention required (page on-call)
- **WARN:** Investigate soon (non-critical failure)
- **INFO:** Audit trail, business events
- **DEBUG:** Development only (disabled in production)

**Structured Logging Format:**
```json
{
  "timestamp": "2026-02-03T15:30:00.123Z",
  "level": "INFO",
  "service": "api",
  "traceId": "abc123",
  "spanId": "def456",
  "userId": "uuid",
  "organizationId": "uuid",
  "message": "Event created",
  "context": {
    "eventType": "LABOR_COST",
    "amount": -150.00,
    "projectId": "uuid"
  }
}
```

**Log Retention:**
- Hot: 7 days (searchable, fast queries)
- Warm: 90 days (compressed, slower queries)
- Cold: 1 year (archived, rare access)
- Audit logs: 7 years (compliance)

**Sensitive Data Redaction:**
- Auto-redact: passwords, tokens, credit cards, SSNs
- PII: Logged only with explicit consent flag
- Financial amounts: Logged but access-controlled

---

### Metrics & Monitoring

**Golden Signals:**

1. **Latency** (response time)
   - P50, P95, P99 for all API endpoints
   - Alert: P95 >2x target for 5 minutes

2. **Traffic** (request rate)
   - Requests per second per endpoint
   - Alert: >50% spike in 5 minutes (possible attack)

3. **Errors** (failure rate)
   - Error rate % per endpoint
   - Alert: >1% error rate for 5 minutes

4. **Saturation** (resource utilization)
   - CPU: Alert at >80% for 10 minutes
   - Memory: Alert at >85%
   - Disk: Alert at >80% full
   - Database connections: Alert at >80% pool

**Custom Metrics:**
- Events ingested per minute
- Profitability calculations per second
- AI API latency (separate from app latency)
- WebSocket connections (active)
- Sync queue depth (offline devices pending)
- Cache hit rate (Redis)

**Monitoring Tools:**
- **Metrics:** Prometheus + Grafana (or Datadog)
- **APM:** OpenTelemetry → Jaeger (distributed tracing)
- **Uptime:** Pingdom or StatusCake (external synthetic monitoring)
- **Logs:** Loki or ELK stack

---

### Alerting & Paging

**Alert Severity:**

| Severity | Response Time | Escalation | Examples |
|----------|--------------|------------|----------|
| **P0 - Critical** | 15 min | Immediate page, escalate to engineering lead in 30 min | Database down, API 100% error rate |
| **P1 - High** | 1 hour | Page on-call, escalate in 4 hours | Performance degradation, integration failure |
| **P2 - Medium** | 4 hours | Ticket, next business day | Sync delays, cache misses increasing |
| **P3 - Low** | 24 hours | Ticket, backlog | Disk usage warning, minor UI bug |

**On-Call Rotation:**
- 24/7 coverage (1-week shifts)
- Primary + secondary on-call
- Post-incident review (PIR) within 48 hours
- Runbooks for common incidents

---

### Distributed Tracing

**Requirements:**
- Every request assigned unique `traceId`
- Traces span: API → Database, API → Redis, API → External (Claude, QuickBooks)
- Sampling: 100% for errors, 10% for success (cost control)
- Retention: 7 days hot, 30 days archived

**Example Trace:**
```
/api/projects/abc123/profitability (200ms total)
  ├─ Auth middleware (5ms)
  ├─ Query PostgreSQL (80ms)
  │   └─ SELECT * FROM FinancialEvent WHERE projectId=? (75ms)
  ├─ Query Redis cache (3ms) [MISS]
  ├─ Calculate profitability (100ms)
  │   └─ Business logic (packages/core)
  └─ Return response (12ms)
```

**Tooling:** OpenTelemetry SDK → Jaeger or Datadog APM

---

## Compliance & Auditability

### Regulatory Compliance

**GDPR (General Data Protection Regulation) - EU**

Requirements:
- **Right to Access:** Users can export all their data (JSON/CSV)
- **Right to Deletion:** Account deletion removes all PII within 30 days
- **Right to Portability:** Export includes all financial data, ready for import elsewhere
- **Right to Rectification:** Users can correct personal data (name, email)
- **Consent Management:** Explicit opt-in for marketing communications
- **Data Minimization:** Collect only necessary data
- **Breach Notification:** Report breaches to supervisory authority within 72 hours

Implementation:
- `/api/users/me/export` endpoint (full data dump)
- `/api/users/me/delete` endpoint (start deletion process)
- `consent` table tracks user preferences
- Data Processing Agreement (DPA) for all third-party processors (Anthropic, QuickBooks, etc.)

**SOC 2 Type II (Security, Availability, Confidentiality)**

Timeline:
- Q3 2026: SOC 2 Type I (point-in-time audit)
- Q1 2027: SOC 2 Type II (continuous monitoring, 6-12 months)

Requirements:
- Comprehensive audit logging (who, what, when, where, why)
- Access controls (RBAC, MFA, least privilege)
- Encryption (at-rest, in-transit)
- Change management (code review, approval workflows)
- Incident response plan (documented, tested)
- Vendor management (assess all third-party risks)
- Security awareness training (annual for all employees)

---

### Audit Trail

**Immutable Audit Log:**

Events logged:
- All authentication attempts (success, failure)
- Permission changes (role assignments, grants)
- Financial event creation/correction
- Integration connections/disconnections
- Data exports (who, when, what scope)
- Settings changes (org settings, user preferences)
- AI decisions (input, output, approval, rejection)

Schema:
```typescript
interface AuditLogEntry {
  id: UUID
  timestamp: DateTime
  userId: UUID | null  // null for system actions
  organizationId: UUID
  action: string  // e.g., "USER_LOGIN", "EVENT_CREATED"
  entityType: string  // e.g., "FinancialEvent", "User"
  entityId: UUID | null
  changes: JSON  // before & after state
  ipAddress: string
  userAgent: string
  result: "SUCCESS" | "FAILURE"
  failureReason?: string
}
```

Retention: 7 years (immutable, append-only table)

**Compliance Reporting:**
- Pre-built reports: "All changes by user X", "All data exports in date range"
- API: `/api/audit-logs?filter=...` (ADMIN only)
- Export: CSV for external auditors

---

### Financial Data Retention

**Legal Requirements:**
- **IRS (US):** 7 years for business financial records
- **GAAP:** 7 years minimum
- **SOX (Sarbanes-Oxley):** 7 years for public companies

**IntelliSpense Policy:**
- Financial Events: Retained forever (or until organization deleted)
- Audit Logs: 7 years, then archival to cold storage
- User Data: Until account deletion + 30 days
- Backups: 30 days retention, then overwritten

**Data Lifecycle:**
```
Active (hot) → Archived (cold, queryable) → Deleted (after retention period)
   0-2 years        2-7 years                     >7 years (if no legal hold)
```

---

## Usability & Accessibility

### Accessibility Requirements (WCAG 2.1 Level AA)

**Mandatory Compliance:**

1. **Perceivable**
   - Text alternatives for images (alt text)
   - Color not sole means of conveying information (use icons + text)
   - Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text
   - Responsive text: Users can zoom to 200% without loss of functionality

2. **Operable**
   - Keyboard navigation: All features accessible via keyboard (no mouse required)
   - Focus indicators: Visible outline on focused elements
   - No seizure-inducing flashing content (max 3 flashes per second)
   - Skip links: Bypass repetitive navigation

3. **Understandable**
   - Language declared: `<html lang="en">`
   - Error messages: Clear, actionable (not "Error 500")
   - Consistent navigation: Same menu structure across pages

4. **Robust**
   - Semantic HTML: Use `<button>`, `<nav>`, `<main>`, `<header>`, `<footer>`
   - ARIA labels where needed: `aria-label`, `aria-describedby`
   - Valid HTML: No unclosed tags, proper nesting

**Testing:**
- Automated: axe-core in CI/CD (blocks merge if violations)
- Manual: Quarterly testing with screen reader (NVDA, JAWS)
- User testing: Include disabled users in beta program

---

### Internationalization (i18n)

**Phase 1:** English only (en-US)

**Phase 2 (Year 2):** Add languages
- Spanish (es-ES, es-MX)
- French (fr-FR, fr-CA)
- German (de-DE)
- Portuguese (pt-BR)

**Implementation:**
- Framework: react-i18next (web), i18n-js (mobile)
- String extraction: All user-facing strings in translation files
- Number formatting: Locale-aware (1,000.00 vs 1.000,00)
- Date formatting: Locale-aware (MM/DD/YYYY vs DD.MM.YYYY)
- Currency: Multi-currency support (USD, EUR, GBP, CAD, etc.)

---

### Mobile-First Design

**Requirements:**
- Responsive breakpoints: 320px (mobile), 768px (tablet), 1024px (desktop)
- Touch targets: Minimum 44x44px (iOS HIG, Android Material Design)
- Offline messaging: Clear indicator when offline, explain limitations
- Progressive disclosure: Show essential info first, expand for details
- Loading states: Skeleton screens (not spinners) for better perceived performance

**Mobile Performance:**
- First Contentful Paint (FCP): <1.8s
- Time to Interactive (TTI): <3.5s
- Lighthouse score: >90 (performance)

---

## Maintainability & Extensibility

### Code Quality Standards

**Metrics:**

| Metric | Target | Enforcement |
|--------|--------|-------------|
| **Code Coverage** | 80% overall, 100% for core business logic | CI blocks merge if <80% |
| **Complexity (Cyclomatic)** | <10 per function | ESLint warning at 10, error at 15 |
| **File Length** | <500 lines | ESLint warning at 500 |
| **Function Length** | <50 lines | Guideline (not enforced) |
| **Type Coverage** | 100% (no `any`) | TypeScript strict mode |
| **Dependencies** | <50 direct dependencies per app | Review required for new deps |

**Code Review:**
- Required: 1 approval for all PRs
- Critical paths: 2 approvals (auth, payments, profitability calculations)
- Automated checks: ESLint, Prettier, tests, coverage
- Manual checks: Security, performance, UX consistency

---

### Documentation Requirements

**Code Documentation:**
- TSDoc comments for all public functions/classes
- README.md in every app/package with:
  - Purpose
  - Installation
  - Usage examples
  - API reference (if library)
- Architecture Decision Records (ADRs) for major decisions

**API Documentation:**
- OpenAPI spec for REST endpoints (auto-generated from code)
- GraphQL schema documentation (auto-generated)
- Examples for common use cases
- Changelog for breaking changes

**User Documentation:**
- In-app help tooltips for complex features
- Video tutorials for onboarding
- Searchable help center (e.g., Intercom, Zendesk)
- API docs for integration partners

---

### Extensibility Patterns

**Plugin Architecture (Future):**

Allow third-party extensions:
- **Integration connectors:** Add new accounting/time tracking systems
- **Custom allocation rules:** Define own cost attribution logic
- **Dashboard widgets:** Add custom visualizations
- **Report templates:** Custom report formats

**Extensibility Constraints:**
- Plugins run in sandbox (no direct database access)
- API rate limits apply
- Security review required for marketplace listing
- Versioning: Plugins declare compatible IntelliSpense versions

**Example Plugin API:**
```typescript
interface IntegrationPlugin {
  name: string
  version: string
  authenticate(credentials: OAuthCredentials): Promise<Session>
  sync(since: Date): Promise<FinancialEvent[]>
  mapEntity(external: ExternalEntity): InternalEntity
}
```

---

## Operational Requirements

### Deployment Requirements

**Deployment Frequency:**
- Development: Continuous (every merge to `main`)
- Staging: Continuous
- Production: 
  - API/Backend: Daily (off-peak hours)
  - Web/Mobile: Weekly (user-initiated updates)
  - Critical fixes: Immediate (hot-fix process)

**Deployment Process:**
1. CI/CD runs tests, builds artifacts
2. Deploy to staging, run smoke tests
3. Blue-green deployment to production (zero downtime)
4. Monitor for errors (rollback if error rate >1%)
5. Gradually shift traffic 10% → 50% → 100% (canary)

**Rollback Criteria:**
- Error rate >1% for 5 minutes
- P95 latency >2x baseline
- User-reported critical bug
- Database migration failure

**Rollback Time:** <5 minutes (automated)

---

### Database Migrations

**Requirements:**
- Backward compatible: New code works with old schema (during deployment)
- Tested: Run migration against production snapshot in staging
- Reversible: Every migration has `up` and `down` scripts
- Fast: Complete in <10 minutes (or run offline during maintenance window)
- Transactional: Wrapped in transaction (rollback on failure)

**Migration Process:**
1. Write migration (Prisma migrate create)
2. Test in local dev environment
3. Test in staging with production data copy
4. Schedule maintenance window (if >1 minute expected)
5. Run migration, monitor error logs
6. Verify data integrity (checksums, counts)

**Dangerous Operations:**
- Adding non-nullable column: Requires default or backfill
- Dropping column: Deprecate first, drop after 1 release (2 weeks)
- Renaming table/column: Create alias, migrate code, then rename

---

### Backup & Recovery

**Backup Strategy:**

| Data Type | Frequency | Retention | Tested |
|-----------|-----------|-----------|--------|
| **PostgreSQL** | Continuous (WAL) + Daily full | 30 days | Monthly restore drill |
| **Redis** | Daily snapshot | 7 days | Quarterly (cache is ephemeral) |
| **File Storage (Spaces)** | Daily incremental | 30 days | Quarterly sample restore |
| **Configuration (env vars)** | On change | Forever (git) | Quarterly disaster recovery drill |

**Recovery Procedures:**
- **Database:** Point-in-time recovery from WAL archives (RPO: 5 minutes)
- **Full System:** Reconstruct from backups + git + infrastructure-as-code (RTO: 4 hours)

---

### Runbooks

**Required Runbooks:**

1. **Database Connection Pool Exhausted**
   - Symptoms: API returning 503, "no available connections"
   - Diagnosis: Check PgBouncer metrics, active connections
   - Resolution: Scale connection pool, identify long-running queries, kill if necessary

2. **High API Latency**
   - Symptoms: P95 >2x baseline
   - Diagnosis: Check APM traces, identify slow endpoint
   - Resolution: Check database slow query log, add index if needed, scale instances

3. **Integration Sync Failure**
   - Symptoms: SyncLog shows repeated failures
   - Diagnosis: Check error messages, OAuth token expiry
   - Resolution: Refresh OAuth token, retry sync, notify user if persistent

4. **AI API Timeout**
   - Symptoms: Claude API calls timing out
   - Diagnosis: Check Claude status page, latency metrics
   - Resolution: Enable circuit breaker, use cached responses, notify users

5. **Disk Space Full**
   - Symptoms: Writes failing, logs showing "no space left"
   - Diagnosis: Check disk usage per directory
   - Resolution: Delete old logs, archive events, expand volume

---

### Capacity Planning

**Growth Assumptions:**
- User growth: 20% month-over-month (Year 1)
- Event volume: Scales linearly with users (avg 50 events/user/month)
- Storage: 10GB per 10,000 users (Year 1)

**Proactive Scaling Triggers:**
- CPU >70% sustained for 1 week → Scale up
- Database size >75% of volume → Expand storage
- Connection pool >60% utilization → Increase pool size
- Cache hit rate <80% → Increase Redis memory

**Quarterly Reviews:**
- Analyze growth trends
- Forecast capacity needs for next 6 months
- Budget for infrastructure scaling
- Test scaling procedures (e.g., add read replica, partition table)

---

## Governance

**NFR Review Process:**
- Quarterly: Review all SLOs, adjust based on actual performance
- Post-incident: Update NFRs if incident revealed gaps
- Before major features: Assess NFR impact (will this 10x traffic?)

**Enforcement:**
- CI/CD: Automated checks for performance, security, accessibility
- SRE: Monitor SLOs, alert on violations
- Engineering: Code review checklists include NFR compliance
- Leadership: NFRs inform prioritization (technical debt vs features)

**Documentation:**
- This document is source of truth
- Changes require Architecture Review Board approval
- Propagate to monitoring alerts, runbooks, test specs

---

**Last Review:** 2026-02-03  
**Next Review:** 2026-05-03 (quarterly)
