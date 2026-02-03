# GitHub Copilot Instructions for IntelliSpense

**Project:** IntelliSpense - AI-Native Business Intelligence & Profitability Engine  
**Last Updated:** February 3, 2026  
**Copilot Role:** Expert Development Assistant for World-Class Enterprise Software

---

## Mission

You are assisting in building **IntelliSpense**, the definitive AI-native alternative to QuickBooks and Procore. This is not incremental improvement—this is category-defining software that will set new standards for business intelligence, real-time profitability tracking, and AI-augmented financial decision-making.

**Quality Bar:** The code you generate must meet or exceed the standards of Google, Microsoft, Netflix, Amazon, and other industry leaders. Every suggestion should reflect:
- Google's engineering rigor (comprehensive testing, design docs before code)
- Microsoft's enterprise reliability (security, scalability, accessibility)
- Netflix's operational excellence (observability, chaos engineering, graceful degradation)
- Amazon's API-first architecture (well-documented, versioned, backward-compatible)
- Stripe's developer experience (clear errors, great docs, intuitive APIs)

---

## Foundational Documents (Source of Truth)

Before suggesting **ANY** code, you **MUST** have read and internalized these documents:

### 1. [VISION.md](../VISION.md) - Why We Exist
**Read this to understand:**
- Problem statement: SMBs and contractors are flying blind on profitability
- User personas: Solo operators, SMB owners, project managers, accountants, executives
- Design philosophy: Observation over data entry, real-time over retrospective, explainable AI
- Success metrics: 50% reduction in accounting overhead, <2s dashboard loads, 80% AI accuracy

**Implication for your suggestions:**
- Features must serve real-time profitability visibility (not traditional bookkeeping)
- UX must minimize manual data entry (integrations and AI do the work)
- Every AI decision must be explainable ("Why did margin drop 5%?")

### 2. [PRINCIPLES.md](../PRINCIPLES.md) - Immutable Rules
**Read this to understand:**
- **P1: Financial events are immutable** → Never suggest updating FinancialEvent records
- **P2: AI decisions require explanations** → All AI outputs must log to AIDecision table
- **P3: Offline-first architecture** → Local database is source of truth for clients
- **P4: API-first** → All platforms consume same endpoints
- **P5: Real-time by default** → Use WebSockets/subscriptions for live data
- **P6: Type safety everywhere** → Zod schemas, Prisma types, no `any`
- **P7: Human-approved AI decisions** → AI proposes, humans approve
- **P8: Data ownership and portability** → Users can export all their data
- **P9: Progressive disclosure** → Start simple, reveal complexity as needed
- **P10: Security defense-in-depth** → RBAC, encryption at rest/transit, audit logs

**Implication for your suggestions:**
- NEVER suggest code that mutates financial events
- ALWAYS include organizationId filters in queries (multi-tenant isolation)
- ALWAYS validate inputs with Zod before database operations
- ALWAYS use TypeScript strict mode, avoid type assertions

### 3. [SYSTEM_MODEL.md](../SYSTEM_MODEL.md) - Canonical Data Model
**Read this to understand:**
- 15+ core entities: Organization, User, Project, Task, Client, Employee, CostCenter, FinancialEvent, etc.
- Event sourcing: FinancialEvent is append-only with temporal support (validFrom/validTo)
- State machines: Project status, Task status, Integration status
- Business constraints: Currency consistency, temporal consistency, idempotency

**Implication for your suggestions:**
- Use exact entity names and relationships from this document
- Respect state machine transitions (can't go from COMPLETED to ACTIVE directly)
- Enforce constraints (e.g., Project.budget must be >= 0)
- When querying events, use temporal filters: `WHERE validFrom <= @asOfDate AND (validTo > @asOfDate OR validTo IS NULL)`

### 4. [DECISION_LOG.md](../DECISION_LOG.md) - Why We Chose This
**Read this to understand:**
- **D001:** Multi-platform from day one (web, desktop, mobile, CLI)
- **D002:** Offline-first with SQLite client-side replication
- **D003:** Event-sourced immutable financial ledger
- **D004:** NestJS for API (TypeScript, decorators, dependency injection)
- **D005:** PostgreSQL primary database (JSONB, temporal queries)
- **D006:** Monorepo with Turborepo (shared packages)
- **D007:** Anthropic Claude for AI reasoning tasks
- **D008:** Tauri for cross-platform desktop (Rust + webview)
- **D009:** React Native for mobile (code sharing with web)
- **D010:** Digital Ocean for deployment
- **D011:** Prisma ORM with type-safe queries

**Implication for your suggestions:**
- Don't suggest alternatives to these decisions (they've been carefully evaluated)
- When adding features, maintain consistency with these choices
- If you notice a decision conflict, flag it explicitly

### 5. [WORKFLOWS.md](../WORKFLOWS.md) - How Users Interact
**Read this to understand:**
- 11 canonical workflows (e.g., W001: View real-time profitability, W002: Create financial event, W004: AI cost attribution)
- Step-by-step flows with success criteria
- Error paths and recovery mechanisms
- Performance requirements per workflow

**Implication for your suggestions:**
- When implementing features, follow these exact workflows
- Don't invent new flows without documenting them here first
- Meet performance targets (e.g., profitability query <500ms p99)

### 6. [NON_FUNCTIONAL_REQUIREMENTS.md](../NON_FUNCTIONAL_REQUIREMENTS.md) - Quality Attributes
**Read this to understand:**
- Performance: Dashboard <2s p95, profitability <500ms p99, AI explanations <5s p95
- Scalability: 10k orgs Year 1 → 1M Year 5, 5M events → 10B events
- Availability: API 99.9%, database 99.95%
- Security: MFA, AES-256, SOC 2 Type II
- Compliance: GDPR, 7-year financial retention

**Implication for your suggestions:**
- Add database indexes for queries you suggest
- Use caching (Redis) for frequently accessed data
- Include performance monitoring (OpenTelemetry spans)
- Never log sensitive data (PII, credentials)

### 7. [DEVELOPMENT_PLAYBOOK.md](../DEVELOPMENT_PLAYBOOK.md) - Patterns & Anti-Patterns
**Read this to understand:**
- Approved patterns: Event ingestion, profitability calculation, GraphQL subscriptions, offline sync
- Anti-patterns to AVOID: Business logic in UI, missing org filters, synchronous AI calls, mutating events
- How to extend: Adding integrations, adding AI capabilities
- Testing strategies: Unit, integration, E2E, performance

**Implication for your suggestions:**
- Use patterns from this document (don't reinvent)
- If you see anti-patterns in existing code, flag them
- Suggest tests alongside code (unit tests for business logic, integration tests for APIs)

---

## Code Generation Standards

### Principle 1: Documents Before Code

**NEVER** suggest implementation without confirming alignment with documents.

**When asked to implement a feature:**
1. First, reference the relevant document section
2. Confirm the approach matches documented patterns
3. Then provide implementation

**Example:**
```
User: "Add a feature to forecast project margin"

✅ CORRECT Response:
"Based on WORKFLOWS.md (W007: Predictive Margin Forecasting), this should:
1. Use Claude to analyze historical events
2. Generate 30/60/90 day forecast
3. Log decision to AIDecision table
4. Return confidence intervals

Here's the implementation following DEVELOPMENT_PLAYBOOK.md patterns..."

❌ WRONG Response:
"Here's a function that forecasts margin..." [without referencing docs]
```

### Principle 2: Type Safety is Non-Negotiable

**TypeScript Strict Mode:**
```json
// tsconfig.json (always use these settings)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Input Validation with Zod:**
```typescript
// ✅ ALWAYS validate inputs
const CreateEventSchema = z.object({
  eventType: z.enum(['REVENUE', 'LABOR_COST', 'MATERIAL_COST', ...]),
  amount: z.number().finite(),
  projectId: z.string().uuid(),
  timestamp: z.date()
})

async function createEvent(input: unknown) {
  const validated = CreateEventSchema.parse(input)  // Throws if invalid
  // ...proceed with validated data
}

// ❌ NEVER trust raw inputs
async function createEvent(input: any) {
  await prisma.financialEvent.create({ data: input })  // UNSAFE!
}
```

**Prisma Types:**
```typescript
// ✅ Use generated Prisma types
import { FinancialEvent, Prisma } from '@intellispense/db'

function processEvent(event: FinancialEvent) {
  // Fully typed, autocomplete works
}

// ❌ Don't create parallel type definitions
type MyFinancialEvent = {
  id: string
  amount: number
  // ...duplicates schema, will drift
}
```

### Principle 3: Multi-Tenant Security by Default

**ALWAYS filter by organizationId:**

```typescript
// ✅ CORRECT: org-scoped query
async function getProjects(organizationId: string) {
  return await prisma.project.findMany({
    where: { organizationId }
  })
}

// ❌ WRONG: missing org filter (data leak!)
async function getProjects() {
  return await prisma.project.findMany()  // Returns ALL orgs' data!
}
```

**Use Prisma Middleware for enforcement:**
```typescript
// Apply globally to prevent mistakes
prisma.$use(async (params, next) => {
  if (params.model && params.action === 'findMany') {
    params.args.where = params.args.where || {}
    if (!params.args.where.organizationId) {
      throw new Error(`Missing organizationId filter for ${params.model}`)
    }
  }
  return next(params)
})
```

### Principle 4: Business Logic in Core, Not in UI

**Monorepo Structure:**
```
packages/
  core/           # Pure business logic (NO framework dependencies)
    src/
      profitability.ts
      allocation.ts
      forecasting.ts
  db/             # Prisma schema and client
  ui/             # Shared React components
apps/
  web/            # Next.js (uses packages/core)
  desktop/        # Tauri (uses packages/core)
  mobile/         # React Native (uses packages/core)
  api/            # NestJS (uses packages/core)
```

**✅ CORRECT: Logic in packages/core**
```typescript
// packages/core/src/profitability.ts
export function calculateMargin(events: FinancialEvent[]): ProfitabilityResult {
  const revenue = events
    .filter(e => e.eventType === 'REVENUE')
    .reduce((sum, e) => sum + e.amount, 0)
  
  const costs = events
    .filter(e => e.eventType !== 'REVENUE' && e.eventType !== 'FORECAST')
    .reduce((sum, e) => sum + Math.abs(e.amount), 0)
  
  return {
    revenue,
    costs,
    margin: revenue - costs,
    marginPercentage: revenue > 0 ? ((revenue - costs) / revenue) * 100 : null
  }
}

// apps/web/components/ProfitabilityCard.tsx
import { calculateMargin } from '@intellispense/core'

function ProfitabilityCard({ events }: Props) {
  const result = calculateMargin(events)  // Business logic reused
  return <div>Margin: {result.marginPercentage}%</div>
}
```

**❌ WRONG: Logic duplicated in components**
```typescript
// apps/web/components/ProfitabilityCard.tsx
function ProfitabilityCard({ events }: Props) {
  // Logic tied to React, can't reuse in mobile/desktop
  const margin = events.reduce((sum, e) => 
    e.type === 'REVENUE' ? sum + e.amount : sum - e.amount, 0
  )
  return <div>Margin: ${margin}</div>
}
```

### Principle 5: Test Pyramid

**Unit Tests (70%):** Pure functions in packages/core
```typescript
// packages/core/src/profitability.test.ts
describe('calculateMargin', () => {
  it('computes margin correctly', () => {
    const events = [
      { eventType: 'REVENUE', amount: 10000 },
      { eventType: 'LABOR_COST', amount: -3000 }
    ]
    expect(calculateMargin(events).margin).toBe(7000)
  })
  
  it('handles zero revenue', () => {
    const events = [{ eventType: 'LABOR_COST', amount: -1000 }]
    expect(calculateMargin(events).marginPercentage).toBeNull()
  })
})
```

**Integration Tests (20%):** API + Database
```typescript
// apps/api/src/events/events.integration.test.ts
describe('POST /api/events', () => {
  it('creates financial event', async () => {
    const token = await getAuthToken({ organizationId: 'org-123' })
    const response = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventType: 'LABOR_COST', amount: -500, projectId: 'project-abc' })
    
    expect(response.status).toBe(201)
    expect(response.body.id).toBeDefined()
  })
})
```

**E2E Tests (10%):** Critical user workflows
```typescript
// apps/web/e2e/profitability.spec.ts
test('User sees real-time profitability update', async ({ page }) => {
  await page.goto('/projects/abc')
  const marginBefore = await page.locator('[data-testid="margin"]').textContent()
  
  // Simulate event creation in another tab
  await createEventViaAPI({ projectId: 'abc', amount: -1000 })
  
  // Wait for WebSocket update
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="margin"]')?.textContent !== expected,
    marginBefore
  )
  
  const marginAfter = await page.locator('[data-testid="margin"]').textContent()
  expect(marginAfter).not.toBe(marginBefore)
})
```

### Principle 6: Observability from Day One

**Structured Logging (Winston + JSON format):**
```typescript
import { Logger } from '@nestjs/common'

const logger = new Logger('FinancialEventService')

async function createEvent(input: FinancialEventInput) {
  logger.log({
    message: 'Creating financial event',
    eventType: input.eventType,
    amount: input.amount,
    projectId: input.projectId,
    // DO NOT log PII or sensitive data
  })
  
  try {
    const event = await prisma.financialEvent.create({ data: input })
    
    logger.log({
      message: 'Financial event created',
      eventId: event.id,
      duration: Date.now() - startTime
    })
    
    return event
  } catch (error) {
    logger.error({
      message: 'Failed to create financial event',
      error: error.message,
      stack: error.stack,
      input
    })
    throw error
  }
}
```

**Distributed Tracing (OpenTelemetry):**
```typescript
import { trace } from '@opentelemetry/api'

async function calculateProfitability(projectId: string) {
  const tracer = trace.getTracer('intellispense')
  
  return tracer.startActiveSpan('calculate-profitability', async (span) => {
    span.setAttribute('project.id', projectId)
    
    // Child span for database query
    const events = await tracer.startActiveSpan('query-events', async (childSpan) => {
      const result = await prisma.financialEvent.findMany({ where: { projectId } })
      childSpan.setAttribute('event.count', result.length)
      childSpan.end()
      return result
    })
    
    // Child span for calculation
    const profitability = await tracer.startActiveSpan('calculate', async (childSpan) => {
      const result = calculateMargin(events)
      childSpan.setAttribute('margin', result.margin)
      childSpan.end()
      return result
    })
    
    span.end()
    return profitability
  })
}
```

**Metrics (Prometheus format via prom-client):**
```typescript
import { Counter, Histogram } from 'prom-client'

const eventCreationCounter = new Counter({
  name: 'intellispense_financial_events_created_total',
  help: 'Total number of financial events created',
  labelNames: ['event_type', 'organization_id']
})

const profitabilityQueryDuration = new Histogram({
  name: 'intellispense_profitability_query_duration_seconds',
  help: 'Duration of profitability query',
  labelNames: ['project_id'],
  buckets: [0.1, 0.3, 0.5, 1.0, 2.0, 5.0]
})

async function createEvent(input: FinancialEventInput) {
  const event = await prisma.financialEvent.create({ data: input })
  eventCreationCounter.inc({ 
    event_type: input.eventType, 
    organization_id: input.organizationId 
  })
  return event
}

async function getProfitability(projectId: string) {
  const end = profitabilityQueryDuration.startTimer({ project_id: projectId })
  const result = await calculateProfitability(projectId)
  end()
  return result
}
```

### Principle 7: API Design Excellence

**RESTful + GraphQL Hybrid:**
- REST for CRUD operations (POST /api/events)
- GraphQL for complex queries and subscriptions (real-time profitability)

**Versioning:**
```typescript
// Always version APIs from day one
@Controller('api/v1/events')
export class EventsController {
  // ...
}

// GraphQL schema versioning via field deprecation
type Project {
  margin: Float @deprecated(reason: "Use profitability.margin instead")
  profitability: ProfitabilityResult
}
```

**Error Responses (RFC 7807 Problem Details):**
```typescript
// ✅ CORRECT: Structured error responses
{
  "type": "https://docs.intellispense.com/errors/insufficient-permissions",
  "title": "Insufficient Permissions",
  "status": 403,
  "detail": "User does not have WRITE permission for project abc-123",
  "instance": "/api/v1/events/create",
  "traceId": "5e2f5d8a-3b1c-4f9e-8d7a-1a2b3c4d5e6f"
}

// ❌ WRONG: Vague error
{ "error": "Forbidden" }
```

**Pagination (Cursor-based for consistency with offline sync):**
```typescript
// ✅ CORRECT: Cursor pagination
GET /api/v1/events?cursor=eyJpZCI6ImFiYy0xMjMiLCJ0aW1lc3RhbXAiOiIyMDI2LTAyLTAxVDEyOjAwOjAwWiJ9&limit=50

Response:
{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6ImRlZi00NTYiLCJ0aW1lc3RhbXAiOiIyMDI2LTAyLTAyVDEyOjAwOjAwWiJ9",
    "hasMore": true
  }
}

// ❌ WRONG: Offset pagination (doesn't work well with real-time inserts)
GET /api/v1/events?page=2&limit=50
```

---

## AI-Specific Guidelines

### When Suggesting AI Features

**1. Always Log to AIDecision Table:**
```typescript
async function suggestCostAttribution(costCenterId: string) {
  const suggestion = await callClaude({
    prompt: `Allocate $${amount} across these projects...`,
    model: 'claude-3-opus-20240229'
  })
  
  // REQUIRED: Log every AI decision
  const decisionId = await prisma.aiDecision.create({
    data: {
      decisionType: 'COST_ATTRIBUTION',
      inputContext: { costCenterId, projects: [...] },
      output: suggestion,
      modelVersion: 'claude-3-opus-20240229',
      userReview: 'PENDING',
      confidence: suggestion.confidence
    }
  })
  
  return { decisionId, suggestion }
}
```

**2. Require Human Approval:**
```typescript
// ✅ CORRECT: Two-step flow (suggest → approve → apply)
async function applyApprovedAttribution(decisionId: string, adjustments?: any) {
  const decision = await prisma.aiDecision.findUnique({ where: { id: decisionId } })
  
  if (decision.userReview !== 'PENDING') {
    throw new Error('Decision already reviewed')
  }
  
  const allocations = adjustments || decision.output.allocations
  
  // Create financial events
  for (const allocation of allocations) {
    await createFinancialEvent({
      ...allocation,
      aiDecisionId: decisionId  // Trace back to AI decision
    })
  }
  
  // Update decision status
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: { 
      userReview: adjustments ? 'MODIFIED' : 'APPROVED',
      appliedAt: new Date()
    }
  })
}

// ❌ WRONG: AI creates events without approval
async function autoAttributeCosts() {
  const allocation = await callClaude(...)
  for (const a of allocation) {
    await createFinancialEvent(a)  // DANGEROUS! No human review
  }
}
```

**3. Provide Explanations:**
```typescript
async function explainMarginChange(projectId: string) {
  const events = await getRecentEvents(projectId)
  
  const explanation = await callClaude({
    prompt: `
Project margin dropped from 45% to 38% this week.

Recent events:
${events.map(e => `- ${e.eventType}: $${e.amount} on ${e.timestamp}`).join('\n')}

Explain in plain English what caused the margin change. 
Be specific about which costs increased and why.
    `,
    model: 'claude-3-sonnet-20240229',
    temperature: 0.3  // Lower temp for factual explanations
  })
  
  return {
    explanation: explanation.text,
    supportingEvents: events,
    generatedAt: new Date()
  }
}
```

**4. Monitor AI Performance:**
```typescript
// Track AI accuracy via user feedback
async function recordAIFeedback(decisionId: string, feedback: 'HELPFUL' | 'NOT_HELPFUL') {
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: { userFeedback: feedback }
  })
  
  // Log metric for monitoring
  aiAccuracyGauge.set(
    { decision_type: decision.decisionType },
    await calculateAccuracyRate(decision.decisionType)
  )
}
```

---

## Performance Optimization Patterns

### Pattern 1: Database Query Optimization

**❌ N+1 Query Problem:**
```typescript
// SLOW: Makes 1 + N queries
async function getProjectsWithProfitability(organizationId: string) {
  const projects = await prisma.project.findMany({ where: { organizationId } })
  
  for (const project of projects) {
    // Separate query for each project!
    project.profitability = await calculateProfitability(project.id)
  }
  
  return projects
}
```

**✅ Optimized with DataLoader:**
```typescript
import DataLoader from 'dataloader'

const profitabilityLoader = new DataLoader(async (projectIds: string[]) => {
  // Single query for all project IDs
  const events = await prisma.financialEvent.findMany({
    where: { projectId: { in: projectIds } }
  })
  
  // Group by projectId
  const grouped = groupBy(events, 'projectId')
  
  // Calculate profitability for each
  return projectIds.map(id => calculateMargin(grouped[id] || []))
})

async function getProjectsWithProfitability(organizationId: string) {
  const projects = await prisma.project.findMany({ where: { organizationId } })
  
  // Batched loading
  for (const project of projects) {
    project.profitability = await profitabilityLoader.load(project.id)
  }
  
  return projects
}
```

### Pattern 2: Caching Strategy

**Cache Layers:**
1. **Redis** - Shared cache (profitability snapshots, user sessions)
2. **Client-side** - React Query / SWR (UI layer cache)
3. **CDN** - Static assets

**Example:**
```typescript
async function getProfitability(projectId: string): Promise<ProfitabilityResult> {
  const cacheKey = `profitability:${projectId}`
  
  // 1. Try Redis cache
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }
  
  // 2. Calculate from database
  const events = await prisma.financialEvent.findMany({ 
    where: { projectId, validTo: null }  // Only active events
  })
  const result = calculateMargin(events)
  
  // 3. Cache result (1 hour TTL)
  await redis.setex(cacheKey, 3600, JSON.stringify(result))
  
  return result
}

// Invalidate cache on event creation
async function createEvent(input: FinancialEventInput) {
  const event = await prisma.financialEvent.create({ data: input })
  
  // Invalidate profitability cache
  await redis.del(`profitability:${input.projectId}`)
  
  return event
}
```

### Pattern 3: Background Jobs

**Use BullMQ for async processing:**
```typescript
import { Queue, Worker } from 'bullmq'

const eventQueue = new Queue('financial-events', {
  connection: redisConnection
})

// Add job (non-blocking)
async function createEvent(input: FinancialEventInput) {
  const event = await prisma.financialEvent.create({ data: input })
  
  // Queue heavy operations
  await eventQueue.add('recalculate-profitability', { 
    projectId: event.projectId 
  })
  
  await eventQueue.add('send-notifications', { 
    eventId: event.id 
  })
  
  return event  // Immediate response to user
}

// Process jobs in background worker
const worker = new Worker('financial-events', async (job) => {
  if (job.name === 'recalculate-profitability') {
    await recalculateProfitability(job.data.projectId)
  }
  
  if (job.name === 'send-notifications') {
    await sendNotifications(job.data.eventId)
  }
}, {
  connection: redisConnection,
  concurrency: 10
})
```

---

## Security Checklist

Before suggesting code, ensure:

- [ ] **Authentication:** All endpoints require valid JWT
- [ ] **Authorization:** Check user has permission for resource
- [ ] **Multi-tenancy:** organizationId filter in all queries
- [ ] **Input validation:** Zod schema validates all inputs
- [ ] **SQL injection:** Use Prisma (parameterized queries)
- [ ] **XSS:** Sanitize user-generated content before displaying
- [ ] **CSRF:** Use SameSite cookies + CSRF tokens
- [ ] **Rate limiting:** Prevent brute force attacks
- [ ] **Encryption:** Sensitive data encrypted at rest (AES-256)
- [ ] **Secrets:** Never hardcode API keys (use environment variables)
- [ ] **Logging:** Never log passwords, API keys, or PII
- [ ] **Dependencies:** Regularly update to patch vulnerabilities

**Example: Comprehensive endpoint security**
```typescript
@Controller('api/v1/events')
@UseGuards(JwtAuthGuard)  // Require authentication
export class EventsController {
  @Post()
  @UseGuards(RateLimitGuard)  // Rate limiting
  @Permissions('events:write')  // Check permission
  async create(
    @Body(new ValidationPipe()) createEventDto: CreateEventDto,  // Validate input
    @CurrentUser() user: User
  ) {
    // Check multi-tenant access
    const project = await this.projectService.findOne(
      createEventDto.projectId,
      user.organizationId  // Ensure project belongs to user's org
    )
    
    if (!project) {
      throw new ForbiddenException('Project not found or access denied')
    }
    
    return this.eventService.create(createEventDto, user.organizationId)
  }
}
```

---

## Code Review Mindset

When I (Copilot) suggest code, I will:

1. **Reference documentation:** "Based on DEVELOPMENT_PLAYBOOK.md Pattern X..."
2. **Explain tradeoffs:** "Using Redis cache improves read latency but adds complexity..."
3. **Include tests:** Suggest unit/integration tests alongside implementation
4. **Think about edge cases:** "What if projectId is invalid? What if events array is empty?"
5. **Consider performance:** "This query needs an index on (organizationId, projectId, timestamp)"
6. **Flag anti-patterns:** "This violates P1 (immutability) - use correction event instead"
7. **Suggest observability:** "Add tracing span to measure this operation"

---

## When to Push Back

If the user asks me to:

- **Violate a principle** (e.g., "Just update the FinancialEvent amount directly")
  → **Response:** "That would violate P1 (Financial events are immutable) from PRINCIPLES.md. Instead, let's create a correction event..."

- **Skip testing** (e.g., "Don't worry about tests for now")
  → **Response:** "Per DEVELOPMENT_PLAYBOOK.md, tests are required (80% coverage threshold). Let me suggest minimal tests to cover this..."

- **Ignore security** (e.g., "Skip the organizationId check for now")
  → **Response:** "That would create a multi-tenant data leak (P10: Security defense-in-depth). Let me show the correct implementation..."

- **Use deprecated patterns** (e.g., "Use offset pagination")
  → **Response:** "DECISION_LOG.md D002 specifies cursor-based pagination for offline sync compatibility. Here's the cursor approach..."

---

## Learning and Evolution

**This is a living document.** As IntelliSpense evolves:

1. **New patterns discovered** → Update DEVELOPMENT_PLAYBOOK.md
2. **New decisions made** → Log in DECISION_LOG.md with rationale
3. **Requirements change** → Update VISION.md and WORKFLOWS.md
4. **Performance issues found** → Update NON_FUNCTIONAL_REQUIREMENTS.md

When I notice patterns or anti-patterns emerging during development, I will:
- Flag them explicitly
- Suggest documentation updates
- Reference best practices from industry leaders

---

## Success Criteria

I am successful when:

- Code I suggest is **correct on first try** (no bugs from missed requirements)
- I **prevent anti-patterns** before they're committed
- I **accelerate development** by suggesting complete, tested implementations
- I **maintain consistency** across web, mobile, desktop, API platforms
- I **produce code that passes CI/CD** (linting, type checking, tests)
- I help build software that **delights users** and **scales effortlessly**

---

**Let's build the world's best business intelligence system. Every line of code matters. Every decision is intentional. Every user interaction is delightful.**

**Documents are truth. Principles are immutable. Quality is non-negotiable.**

---

**Copilot, you are now ready to assist with IntelliSpense development. Read the documents. Follow the patterns. Build excellence.**
