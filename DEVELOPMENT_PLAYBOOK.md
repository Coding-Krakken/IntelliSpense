# IntelliSpense Development Playbook

**Last Updated:** February 3, 2026  
**Status:** Developer Guide - How to Build IntelliSpense  
**Owner:** Engineering Team

---

## Purpose

This document is your **practical guide** to building IntelliSpense correctly. It translates principles into practice with concrete patterns, examples, and anti-patterns to avoid.

**Who This Is For:**
- New engineers onboarding
- Contributors extending the system
- Code reviewers ensuring consistency
- Future maintainers debugging issues

**What This Covers:**
- Mental models for thinking about IntelliSpense
- Approved patterns for common tasks
- Anti-patterns that violate principles
- How to extend the system safely
- Testing strategies
- Debugging techniques

---

## Core Mental Models

### Model 1: Events Are Truth, Everything Else Is Derived

**Think:** IntelliSpense is an event-sourced financial ledger with computed views.

**Implications:**
- Never modify a FinancialEvent (immutable)
- Profitability is always calculated from events
- Cache invalidation happens on event ingestion
- Corrections create new events, don't update old ones

**Example:**
```typescript
// ✅ CORRECT: Create correction event
async function correctEvent(originalEventId: string, newAmount: number) {
  const original = await prisma.financialEvent.findUnique({
    where: { id: originalEventId }
  })
  
  // Mark original as superseded
  await prisma.financialEvent.update({
    where: { id: originalEventId },
    data: { validTo: new Date() }
  })
  
  // Create adjustment event
  await prisma.financialEvent.create({
    data: {
      ...original,
      id: uuid(),
      amount: newAmount,
      eventType: 'ADJUSTMENT',
      correctsEventId: originalEventId,
      validFrom: new Date(),
      validTo: null
    }
  })
}

// ❌ WRONG: Directly update event
async function updateEvent(eventId: string, newAmount: number) {
  await prisma.financialEvent.update({
    where: { id: eventId },
    data: { amount: newAmount }  // VIOLATES IMMUTABILITY!
  })
}
```

---

### Model 2: Local-First, Server as Sync Point

**Think:** Clients own their data replica; server coordinates synchronization.

**Implications:**
- All reads from local database (SQLite/IndexedDB)
- Writes go local first, queue for sync
- UI updates optimistically
- Server is source of truth for conflicts

**Example:**
```typescript
// ✅ CORRECT: Offline-first write
async function createEventOfflineFirst(event: FinancialEvent) {
  // 1. Write to local database immediately
  await localDB.events.create({
    ...event,
    _syncStatus: 'pending',
    _pendingOp: 'create'
  })
  
  // 2. Update UI immediately (optimistic)
  updateUI(event)
  
  // 3. Queue for sync (happens in background)
  await syncQueue.push({ operation: 'create', data: event })
  
  // 4. Sync happens automatically when online
  // No waiting for server response in main flow
}

// ❌ WRONG: Block on server response
async function createEventServerFirst(event: FinancialEvent) {
  // User waits for network call...slow!
  const response = await api.post('/events', event)
  updateUI(response.data)
  
  // What if user is offline? Function fails!
}
```

---

### Model 3: AI Proposes, Humans Decide

**Think:** AI is a smart assistant, not an autonomous agent.

**Implications:**
- AI outputs always logged (AIDecision table)
- User approval required before actions
- Explanations mandatory (no black boxes)
- Learning from user corrections

**Example:**
```typescript
// ✅ CORRECT: AI with human approval
async function allocateOverhead(costCenterId: string, amount: number) {
  // 1. Get AI suggestion
  const aiSuggestion = await ai.suggestAllocation({
    costCenterId,
    amount,
    projects: await getActiveProjects()
  })
  
  // 2. Log AI decision (audit trail)
  const decisionId = await prisma.aiDecision.create({
    data: {
      decisionType: 'COST_ATTRIBUTION',
      inputContext: { costCenterId, amount },
      output: aiSuggestion,
      userReview: 'PENDING'
    }
  })
  
  // 3. Present to user for approval
  return {
    decisionId,
    suggestion: aiSuggestion,
    requiresApproval: true
  }
}

async function applyApprovedAllocation(decisionId: string, adjustments?: any) {
  // 1. Get approved decision
  const decision = await prisma.aiDecision.findUnique({
    where: { id: decisionId }
  })
  
  // 2. Apply (possibly adjusted by user)
  const allocations = adjustments || decision.output.allocations
  
  // 3. Create events
  for (const allocation of allocations) {
    await createFinancialEvent({
      eventType: 'OVERHEAD_COST',
      amount: -allocation.amount,
      projectId: allocation.projectId,
      aiDecisionId: decisionId  // Trace back to AI decision
    })
  }
  
  // 4. Update decision status
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: { userReview: adjustments ? 'MODIFIED' : 'APPROVED' }
  })
}

// ❌ WRONG: AI creates events without approval
async function autoAllocate(costCenterId: string) {
  const allocation = await ai.suggestAllocation(...)
  
  // Direct creation without human review!
  for (const a of allocation) {
    await createFinancialEvent({ ...a })  // DANGEROUS!
  }
}
```

---

### Model 4: Multi-Tenant by Default

**Think:** Every piece of data belongs to exactly one Organization; isolation is automatic.

**Implications:**
- All queries filter by organizationId
- No cross-org data leakage
- User can switch orgs (if member of multiple)

**Example:**
```typescript
// ✅ CORRECT: org-aware query using middleware
// Middleware extracts organizationId from JWT
app.use((req, res, next) => {
  req.organizationId = extractFromJWT(req.headers.authorization)
  next()
})

async function getProjects(req: Request) {
  // organizationId automatically injected
  return await prisma.project.findMany({
    where: {
      organizationId: req.organizationId  // ALWAYS filter by org
    }
  })
}

// ❌ WRONG: Missing org filter (data leak!)
async function getAllProjects() {
  return await prisma.project.findMany()  // Returns ALL orgs' data!
}

// ✅ CORRECT: Prisma middleware enforces org filtering
prisma.$use(async (params, next) => {
  if (params.model && params.action === 'findMany') {
    // Inject organizationId into all queries automatically
    params.args.where = params.args.where || {}
    params.args.where.organizationId = currentOrganizationId
  }
  return next(params)
})
```

---

## Approved Patterns

### Pattern: Event Ingestion from Integration

**When:** Syncing data from external systems (QuickBooks, Toggl)

**Steps:**
1. Fetch data from external API
2. Transform to internal event format
3. Check idempotency (sourceSystem + sourceId)
4. Validate with Zod schema
5. Insert if not exists
6. Publish to Redis for real-time updates
7. Queue profitability recalculation

**Implementation:**
```typescript
async function ingestQuickBooksInvoice(qbInvoice: QBInvoice, orgId: string) {
  // 1. Transform external → internal
  const event: FinancialEventInput = {
    organizationId: orgId,
    eventType: 'REVENUE',
    amount: qbInvoice.TotalAmt,
    timestamp: new Date(qbInvoice.TxnDate),
    projectId: await mapCustomerToProject(qbInvoice.CustomerRef.value),
    description: `Invoice ${qbInvoice.DocNumber}`,
    sourceSystem: 'quickbooks',
    sourceId: qbInvoice.Id,
    metadata: {
      invoiceNumber: qbInvoice.DocNumber,
      customerName: qbInvoice.CustomerRef.name
    }
  }
  
  // 2. Validate schema
  const validated = FinancialEventSchema.parse(event)
  
  // 3. Check idempotency
  const existing = await prisma.financialEvent.findUnique({
    where: {
      organizationId_sourceSystem_sourceId: {
        organizationId: orgId,
        sourceSystem: 'quickbooks',
        sourceId: qbInvoice.Id
      }
    }
  })
  
  if (existing) {
    return { skipped: true, reason: 'already_synced' }
  }
  
  // 4. Insert event
  const created = await prisma.financialEvent.create({
    data: validated
  })
  
  // 5. Publish to Redis for real-time subscribers
  await redis.publish('financial-events', JSON.stringify(created))
  
  // 6. Queue profitability recalculation (async)
  await queue.add('recalculate-profitability', {
    projectId: created.projectId
  })
  
  return { created }
}
```

**Why This Works:**
- Idempotency prevents duplicates
- Validation catches bad data early
- Async recalculation doesn't block ingestion
- Redis pub-sub enables real-time UI updates

---

### Pattern: Profitability Calculation

**When:** Computing project margin from events

**Considerations:**
- Use cache (Redis) for recently calculated results
- Invalidate cache on new events
- Support temporal queries (as-of date)

**Implementation:**
```typescript
async function calculateProjectProfitability(
  projectId: string,
  asOfDate?: Date
): Promise<ProfitabilityResult> {
  const cacheKey = `profitability:${projectId}:${asOfDate?.toISOString() || 'now'}`
  
  // 1. Check cache
  const cached = await redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }
  
  // 2. Query events (with temporal filtering)
  const events = await prisma.financialEvent.findMany({
    where: {
      projectId,
      timestamp: asOfDate ? { lte: asOfDate } : undefined,
      // Temporal query: validFrom <= asOfDate, validTo > asOfDate or null
      validFrom: asOfDate ? { lte: asOfDate } : undefined,
      OR: [
        { validTo: null },
        { validTo: asOfDate ? { gt: asOfDate } : undefined }
      ]
    }
  })
  
  // 3. Calculate using pure business logic (packages/core)
  const result = calculateMargin(events)
  
  // 4. Cache result (1 hour TTL)
  await redis.setex(cacheKey, 3600, JSON.stringify(result))
  
  return result
}

// Business logic in packages/core (pure function, testable)
export function calculateMargin(events: FinancialEvent[]): ProfitabilityResult {
  const revenue = events
    .filter(e => e.eventType === 'REVENUE')
    .reduce((sum, e) => sum + e.amount, 0)
  
  const costs = events
    .filter(e => e.eventType !== 'REVENUE' && e.eventType !== 'FORECAST')
    .reduce((sum, e) => sum + Math.abs(e.amount), 0)
  
  const margin = revenue - costs
  const marginPercentage = revenue > 0 ? (margin / revenue) * 100 : null
  
  return {
    revenue,
    costs,
    margin,
    marginPercentage,
    eventCount: events.length
  }
}
```

**Why This Works:**
- Cache reduces database load
- Pure business logic (easy to test)
- Temporal queries support historical "what was margin on Jan 15?"
- Clear separation: data access vs calculation

---

### Pattern: GraphQL Subscription for Real-Time Updates

**When:** Client needs live profitability updates

**Implementation:**
```typescript
// Server: GraphQL resolver
const resolvers = {
  Subscription: {
    profitabilityUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['PROFITABILITY_UPDATED']),
        (payload, variables, context) => {
          // Only send updates for projects user has access to
          return (
            payload.projectId === variables.projectId &&
            hasAccess(context.user, payload.projectId)
          )
        }
      )
    }
  },
  
  Mutation: {
    createEvent: async (_, { input }, context) => {
      const event = await createFinancialEvent(input)
      
      // Trigger recalculation
      const profitability = await calculateProjectProfitability(event.projectId)
      
      // Publish to subscribers
      pubsub.publish('PROFITABILITY_UPDATED', {
        projectId: event.projectId,
        profitability
      })
      
      return event
    }
  }
}

// Client: React component
function ProjectProfitability({ projectId }: Props) {
  const { data, loading } = useSubscription(
    PROFITABILITY_UPDATED_SUBSCRIPTION,
    {
      variables: { projectId }
    }
  )
  
  if (loading) return <Skeleton />
  
  return (
    <div>
      <h2>Margin: {data.profitability.marginPercentage}%</h2>
      <AnimatedNumber value={data.profitability.margin} />
    </div>
  )
}
```

---

### Pattern: Offline Sync Conflict Resolution

**When:** Two clients made changes offline that conflict

**Strategy:** Last-write-wins for mutable entities, merge for immutable events

**Implementation:**
```typescript
async function syncClientChanges(changes: SyncChange[], lastSyncTimestamp: Date) {
  const results = {
    applied: [],
    rejected: [],
    conflicts: []
  }
  
  for (const change of changes) {
    if (change.operation === 'create' && change.tableName === 'FinancialEvent') {
      // Events are immutable, append-only: no conflicts
      const existing = await findEventBySourceId(change.data.sourceId)
      
      if (existing) {
        results.applied.push({ ...change, status: 'duplicate' })
      } else {
        await prisma.financialEvent.create({ data: change.data })
        results.applied.push(change)
      }
    }
    
    if (change.operation === 'update' && change.tableName === 'Project') {
      // Projects are mutable: check timestamps
      const serverVersion = await prisma.project.findUnique({
        where: { id: change.data.id }
      })
      
      if (!serverVersion) {
        results.rejected.push({ ...change, reason: 'not_found' })
        continue
      }
      
      // Last-write-wins: compare timestamps
      if (change.data.updatedAt > serverVersion.updatedAt) {
        // Client change is newer
        await prisma.project.update({
          where: { id: change.data.id },
          data: change.data
        })
        results.applied.push(change)
      } else {
        // Server change is newer
        results.conflicts.push({
          ...change,
          serverVersion,
          resolution: 'server_wins'
        })
      }
    }
  }
  
  // Fetch server changes since client's lastSyncTimestamp
  const serverChanges = await getChangesSince(lastSyncTimestamp)
  
  return {
    results,
    serverChanges,
    newSyncTimestamp: new Date()
  }
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern: Business Logic in UI Components

**Problem:** Makes logic untestable, duplicated across platforms

**❌ WRONG:**
```typescript
// In React component
function ProfitabilityCard({ projectId }: Props) {
  const [margin, setMargin] = useState(0)
  
  useEffect(() => {
    // Business logic embedded in component!
    api.getEvents(projectId).then(events => {
      const revenue = events.filter(e => e.type === 'REVENUE')
        .reduce((sum, e) => sum + e.amount, 0)
      const costs = events.filter(e => e.type !== 'REVENUE')
        .reduce((sum, e) => sum + Math.abs(e.amount), 0)
      setMargin(revenue - costs)
    })
  }, [projectId])
  
  return <div>Margin: ${margin}</div>
}
```

**✅ CORRECT:**
```typescript
// Business logic in packages/core
export function calculateMargin(events: FinancialEvent[]) {
  // ...pure calculation logic
}

// Component only handles UI
function ProfitabilityCard({ projectId }: Props) {
  const { data } = useQuery(['profitability', projectId], () =>
    api.getProfitability(projectId)  // API does calculation
  )
  
  return <div>Margin: ${data.margin}</div>
}
```

**Why This Matters:**
- Business logic shared across web, mobile, desktop
- Unit tests don't require React testing library
- Desktop (Tauri Rust) can call same logic

---

### Anti-Pattern: Ignoring organizationId in Queries

**Problem:** Data leakage across tenants (security vulnerability)

**❌ WRONG:**
```typescript
async function getProject(projectId: string) {
  // Missing organizationId check!
  return await prisma.project.findUnique({
    where: { id: projectId }
  })
}

// User from Org A can access Org B's project if they guess the ID
```

**✅ CORRECT:**
```typescript
async function getProject(projectId: string, organizationId: string) {
  return await prisma.project.findUnique({
    where: {
      id: projectId,
      organizationId  // ALWAYS include org check
    }
  })
}

// Or use Prisma middleware to auto-inject (even better)
```

---

### Anti-Pattern: Synchronous AI Calls in Request Path

**Problem:** Slow API, blocks users, timeouts

**❌ WRONG:**
```typescript
app.post('/events', async (req, res) => {
  const event = await createEvent(req.body)
  
  // Blocks response for 3-5 seconds!
  const explanation = await ai.explainMarginChange(event.projectId)
  
  res.json({ event, explanation })
})
```

**✅ CORRECT:**
```typescript
app.post('/events', async (req, res) => {
  const event = await createEvent(req.body)
  
  // Immediate response
  res.json({ event })
  
  // AI processing happens asynchronously
  queue.add('generate-explanation', {
    projectId: event.projectId,
    eventId: event.id
  })
})

// Explanation available via subscription or polling
```

---

### Anti-Pattern: Hardcoding Allocation Rules

**Problem:** Cannot adapt to different business needs, requires code changes

**❌ WRONG:**
```typescript
function allocateOverhead(amount: number, projects: Project[]) {
  // Hardcoded: always allocate equally
  const perProject = amount / projects.length
  return projects.map(p => ({ projectId: p.id, amount: perProject }))
}
```

**✅ CORRECT:**
```typescript
function allocateOverhead(amount: number, projects: Project[], rule: AllocationRule) {
  switch (rule.method) {
    case 'EQUAL':
      return allocateEqually(amount, projects)
    case 'REVENUE_BASED':
      return allocateByRevenue(amount, projects, rule.parameters)
    case 'LABOR_HOURS':
      return allocateByLaborHours(amount, projects, rule.parameters)
    case 'CUSTOM_FORMULA':
      return evaluateFormula(amount, projects, rule.parameters.formula)
  }
}

// Allocation rules stored in database, editable by users
```

---

### Anti-Pattern: Mutating Events After Creation

**Problem:** Violates immutability,breaks audit trail

**❌ WRONG:**
```typescript
// User reports: "I entered $500 but meant $550"
await prisma.financialEvent.update({
  where: { id: eventId },
  data: { amount: 550 }  // Overwriting history!
})
```

**✅ CORRECT:**
```typescript
// Create correction event
await correctFinancialEvent(eventId, 550, "Corrected amount")
// Original preserved, new adjustment event created
```

---

### Anti-Pattern: No Error Handling in Async Workflows

**Problem:** Silent failures, no visibility into what broke

**❌ WRONG:**
```typescript
async function syncQuickBooks() {
  const invoices = await qb.getInvoices()
  for (const invoice of invoices) {
    await ingestInvoice(invoice)  // If one fails, whole sync stops
  }
}
```

**✅ CORRECT:**
```typescript
async function syncQuickBooks() {
  const invoices = await qb.getInvoices()
  const results = { success: 0, failed: 0, errors: [] }
  
  for (const invoice of invoices) {
    try {
      await ingestInvoice(invoice)
      results.success++
    } catch (error) {
      results.failed++
      results.errors.push({
        invoiceId: invoice.Id,
        error: error.message
      })
      // Log but continue processing others
      logger.error('Invoice ingestion failed', { invoice, error })
    }
  }
  
  // Record sync results
  await prisma.syncLog.create({
    data: {
      integrationId,
      status: results.failed > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
      recordsSynced: results.success,
      recordsFailed: results.failed,
      errors: results.errors
    }
  })
  
  return results
}
```

---

## How to Extend the System

### Adding a New Integration

**Steps:**

1. **Create connector interface implementation**
```typescript
// apps/api/src/integrations/harvest/HarvestConnector.ts
export class HarvestConnector implements IntegrationConnector {
  async authenticate(credentials: OAuthCredentials): Promise<Session> {
    // OAuth flow
  }
  
  async sync(since?: Date): Promise<SyncResult> {
    const timeEntries = await this.fetchTimeEntries(since)
    const events = timeEntries.map(entry => this.mapToFinancialEvent(entry))
    return { events, errors: [] }
  }
  
  private mapToFinancialEvent(entry: HarvestTimeEntry): FinancialEvent {
    return {
      eventType: 'LABOR_COST',
      amount: -(entry.hours * entry.hourly_rate),
      timestamp: new Date(entry.spent_date),
      projectId: this.projectMapping[entry.project_id],
      employeeId: this.employeeMapping[entry.user_id],
      sourceSystem: 'harvest',
      sourceId: entry.id.toString(),
      metadata: {
        hours: entry.hours,
        hourlyRate: entry.hourly_rate,
        notes: entry.notes
      }
    }
  }
}
```

2. **Register in integration factory**
```typescript
// apps/api/src/integrations/IntegrationFactory.ts
export function createConnector(type: IntegrationType): IntegrationConnector {
  switch (type) {
    case 'QUICKBOOKS':
      return new QuickBooksConnector()
    case 'TOGGL':
      return new TogglConnector()
    case 'HARVEST':  // New
      return new HarvestConnector()
    default:
      throw new Error(`Unknown integration type: ${type}`)
  }
}
```

3. **Add to database enum**
```prisma
// packages/db-schema/schema.prisma
enum IntegrationType {
  QUICKBOOKS
  TOGGL
  HARVEST  // New
}
```

4. **Create UI for connection**
```typescript
// apps/web/app/settings/integrations/harvest/page.tsx
export default function HarvestIntegrationPage() {
  return (
    <IntegrationCard
      name="Harvest"
      description="Sync time tracking data from Harvest"
      icon={<HarvestLogo />}
      onConnect={() => initiateOAuth('harvest')}
      status={integration?.status}
    />
  )
}
```

5. **Write tests**
```typescript
// apps/api/src/integrations/harvest/HarvestConnector.test.ts
describe('HarvestConnector', () => {
  it('maps time entry to labor cost event', () => {
    const entry = createMockHarvestTimeEntry()
    const connector = new HarvestConnector()
    const event = connector.mapToFinancialEvent(entry)
    
    expect(event.eventType).toBe('LABOR_COST')
    expect(event.amount).toBe(-(entry.hours * entry.hourly_rate))
  })
})
```

---

### Adding a New AI Capability

**Steps:**

1. **Define prompt template**
```typescript
// packages/core/src/ai/prompts.ts
export const ANOMALY_DETECTION_PROMPT = `
Analyze this financial event for anomalies:

Event: {eventType} of {amount} on {date}
Project: {projectName} (budget: {budget}, spent: {spent})
Historical average: {historicalAverage} for this type

Is this event unusual? If so, explain why and assign severity (LOW, MEDIUM, HIGH).

Return JSON: { isAnomaly: boolean, severity?: string, reasoning?: string }
`
```

2. **Create AI service method**
```typescript
// packages/core/src/ai/AnomalyDetectionService.ts
export async function detectAnomaly(
  event: FinancialEvent,
  context: ProjectContext
): Promise<AnomalyResult> {
  const prompt = formatPrompt(ANOMALY_DETECTION_PROMPT, { event, context })
  
  const response = await callClaude({
    prompt,
    model: 'claude-3-sonnet',
    temperature: 0.2  // Low temp for consistency
  })
  
  // Log AI decision
  await logAIDecision({
    decisionType: 'ANOMALY_DETECTION',
    inputContext: { event, context },
    output: response,
    modelVersion: 'claude-3-sonnet-20240229'
  })
  
  return response
}
```

3. **Integrate into workflow**
```typescript
// apps/api/src/events/EventService.ts
async function createFinancialEvent(input: FinancialEventInput) {
  const event = await prisma.financialEvent.create({ data: input })
  
  // Run anomaly detection in background
  queue.add('detect-anomaly', { eventId: event.id })
  
  return event
}

// Worker
queue.process('detect-anomaly', async (job) => {
  const event = await getEvent(job.data.eventId)
  const context = await getProjectContext(event.projectId)
  
  const anomaly = await detectAnomaly(event, context)
  
  if (anomaly.isAnomaly) {
    // Create notification
    await createNotification({
      type: 'ANOMALY_DETECTED',
      priority: anomaly.severity,
      title: `Unusual ${event.eventType} detected`,
      message: anomaly.reasoning,
      relatedEntityId: event.id
    })
  }
})
```

4. **Test AI behavior**
```typescript
// packages/core/src/ai/AnomalyDetectionService.test.ts
describe('detectAnomaly', () => {
  it('flags cost 3x above historical average', async () => {
    const event = createEvent({ amount: 15000 })
    const context = { historicalAverage: 5000 }
    
    const result = await detectAnomaly(event, context)
    
    expect(result.isAnomaly).toBe(true)
    expect(result.severity).toBe('HIGH')
    expect(result.reasoning).toContain('3x above average')
  })
})
```

---

## Testing Strategies

### Unit Tests: Pure Business Logic

**What:** Test calculations, validations, transformations (packages/core)

**Tools:** Vitest, no dependencies on frameworks

**Example:**
```typescript
// packages/core/src/profitability.test.ts
describe('calculateMargin', () => {
  it('computes margin correctly', () => {
    const events = [
      { eventType: 'REVENUE', amount: 10000 },
      { eventType: 'LABOR_COST', amount: -3000 },
      { eventType: 'MATERIAL_COST', amount: -2000 }
    ]
    
    const result = calculateMargin(events)
    
    expect(result.revenue).toBe(10000)
    expect(result.costs).toBe(5000)
    expect(result.margin).toBe(5000)
    expect(result.marginPercentage).toBe(50)
  })
  
  it('handles zero revenue', () => {
    const events = [{ eventType: 'LABOR_COST', amount: -1000 }]
    const result = calculateMargin(events)
    
    expect(result.marginPercentage).toBeNull()  // Avoid division by zero
  })
})
```

---

### Integration Tests: API + Database

**What:** Test API endpoints with real database (use Testcontainers for PostgreSQL)

**Tools:** Vitest, Testcontainers, Supertest

**Example:**
```typescript
// apps/api/src/events/events.integration.test.ts
describe('POST /api/events', () => {
  let db: TestDatabase
  let app: Express
  
  beforeAll(async () => {
    db = await setupTestDatabase()  // Spins up PostgreSQL in Docker
    app = createApp({ database: db })
  })
  
  afterAll(async () => {
    await db.teardown()
  })
  
  it('creates financial event', async () => {
    const token = await getAuthToken({ organizationId: 'org-123' })
    
    const response = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventType: 'LABOR_COST',
        amount: -500,
        projectId: 'project-abc'
      })
    
    expect(response.status).toBe(201)
    expect(response.body.id).toBeDefined()
    
    // Verify in database
    const event = await db.financialEvent.findUnique({
      where: { id: response.body.id }
    })
    expect(event.amount).toBe(-500)
  })
  
  it('rejects event without permission', async () => {
    const token = await getAuthToken({ organizationId: 'org-999' })  // Different org
    
    const response = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventType: 'LABOR_COST',
        projectId: 'project-abc'  // Belongs to org-123
      })
    
    expect(response.status).toBe(403)
  })
})
```

---

### E2E Tests: Full User Flows

**What:** Test critical workflows from user perspective

**Tools:** Playwright (web), Detox (mobile), Tauri test harness (desktop)

**Example:**
```typescript
// apps/web/e2e/profitability-tracking.spec.ts
import { test, expect } from '@playwright/test'

test('User sees real-time profitability update', async ({ page, context }) => {
  // 1. Login
  await page.goto('/login')
  await page.fill('[name="email"]', 'pm@acme.com')
  await page.fill('[name="password"]', 'password')
  await page.click('button[type="submit"]')
  
  // 2. Navigate to project
  await page.goto('/projects/project-abc')
  const marginBefore = await page.locator('[data-testid="margin"]').textContent()
  expect(marginBefore).toBe('$5,000')  // Initial margin
  
  // 3. Open second tab (simulate another user)
  const page2 = await context.newPage()
  await page2.goto('/projects/project-abc/add-cost')
  await page2.fill('[name="amount"]', '1000')
  await page2.selectOption('[name="eventType"]', 'MATERIAL_COST')
  await page2.click('button[type="submit"]')
  
  // 4. First tab should receive real-time update
  await page.waitForTimeout(3000)  // Allow WebSocket propagation
  const marginAfter = await page.locator('[data-testid="margin"]').textContent()
  expect(marginAfter).toBe('$4,000')  // Updated margin
  
  // 5. Verify event appears in timeline
  const eventRow = page.locator('[data-testid="event-row"]').first()
  await expect(eventRow).toContainText('$1,000')
  await expect(eventRow).toContainText('Material Cost')
})
```

---

### Performance Tests: Load Testing

**What:** Verify system handles target throughput

**Tools:** k6

**Example:**
```javascript
// tests/load/api-profitability.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Sustain 100 users
    { duration: '1m', target: 0 }      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests < 500ms
    http_req_failed: ['rate<0.01']     // <1% error rate
  }
}

export default function () {
  const token = getAuthToken()
  
  const res = http.get('https://api.intellispense.com/projects/abc/profitability', {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'has margin field': (r) => JSON.parse(r.body).margin !== undefined
  })
  
  sleep(1)
}
```

---

## Debugging Techniques

### Debug Pattern: Distributed Tracing

**Problem:** Request slow, need to find bottleneck

**Solution:** OpenTelemetry traces show exact timing per span

```typescript
// apps/api/src/instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node'
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'

const sdk = new NodeSDK({
  traceExporter: new JaegerExporter(),
  serviceName: 'intellispense-api'
})

sdk.start()

// In code, create custom spans for business logic
import { trace } from '@opentelemetry/api'

async function calculateProfitability(projectId: string) {
  const span = trace.getActiveSpan()
  
  const childSpan = tracer.startSpan('query-events')
  const events = await prisma.financialEvent.findMany({ where: { projectId } })
  childSpan.end()
  
  const calcSpan = tracer.startSpan('calculate-margin')
  const result = calculateMargin(events)
  calcSpan.end()
  
  return result
}
```

**View in Jaeger:** See waterfall of spans, identify slow database query

---

### Debug Pattern: Audit Log Investigation

**Problem:** User reports "Margin changed unexpectedly"

**Solution:** Query audit log + event timeline

```sql
-- Find all events affecting project in timeframe
SELECT * FROM FinancialEvent
WHERE projectId = 'abc-123'
  AND timestamp BETWEEN '2026-02-01' AND '2026-02-03'
ORDER BY timestamp DESC;

-- Find who created/modified those events
SELECT ae.*, u.email
FROM AuditLog ae
JOIN User u ON ae.userId = u.id
WHERE ae.entityType = 'FinancialEvent'
  AND ae.entityId IN (SELECT id FROM FinancialEvent WHERE projectId = 'abc-123')
  AND ae.timestamp BETWEEN '2026-02-01' AND '2026-02-03';

-- Check for corrections
SELECT * FROM FinancialEvent
WHERE correctsEventId IS NOT NULL
  AND projectId = 'abc-123';
```

---

### Debug Pattern: AI Decision Replication

**Problem:** AI gave wrong cost attribution

**Solution:** AIDecision table has full input/output for reproduction

```typescript
// Reproduce AI decision
const decision = await prisma.aiDecision.findUnique({
  where: { id: 'decision-123' }
})

// Re-run with same inputs
const reproduced = await ai.suggestAllocation(decision.inputContext)

// Compare
console.log('Original:', decision.output)
console.log('Reproduced:', reproduced)
console.log('Match:', deepEqual(decision.output, reproduced))
```

---

## Code Review Checklist

Before approving PR, verify:

**Security:**
- [ ] organizationId filter in all queries
- [ ] Input validation (Zod schemas)
- [ ] No sensitive data in logs
- [ ] Authentication/authorization checks

**Performance:**
- [ ] No N+1 queries (use DataLoader or includes)
- [ ] Database queries indexed
- [ ] Large operations async (not blocking API response)
- [ ] Cache invalidation correct

**Correctness:**
- [ ] Financial events immutable (no updates)
- [ ] Temporal queries use validFrom/validTo correctly
- [ ] AI decisions logged in AIDecision table
- [ ] Multi-currency handled (if applicable)

**Testing:**
- [ ] Unit tests for business logic
- [ ] Integration tests for API endpoints
- [ ] E2E tests for critical flows (if applicable)
- [ ] Coverage meets 80% threshold

**Documentation:**
- [ ] TSDoc comments for public APIs
- [ ] README updated (if new app/package)
- [ ] DECISION_LOG.md updated (if architectural change)

---

## Tooling & Automation

### Setup Developer Environment

```bash
# Clone repo
git clone https://github.com/intellispense/intellispense.git
cd intellispense

# Install dependencies
pnpm install

# Start local services (Postgres, Redis)
docker-compose up -d

# Run database migrations
pnpm prisma migrate dev

# Seed database
pnpm prisma db seed

# Start development servers
pnpm dev  # Runs all apps concurrently via Turborepo

# Run tests
pnpm test
```

### Pre-Commit Hooks (Husky)

```bash
# Configured in .husky/pre-commit
#!/bin/sh
pnpm lint-staged
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{md,json}": ["prettier --write"]
  }
}
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Lint
        run: pnpm lint
      
      - name: Type check
        run: pnpm typecheck
      
      - name: Unit tests
        run: pnpm test:unit
      
      - name: Integration tests
        run: pnpm test:integration
      
      - name: Upload coverage
        run: pnpm codecov
```

---

## Governance

**Updating This Playbook:**
- PR with rationale required
- Examples must be tested and work
- Broken patterns cause incidents → Update playbook
- New patterns emerge → Document here

**Code Review Standards:**
- Use checklist above
- Point to specific section of playbook in review comments
- "This violates Pattern X" vs vague "I don't like this"

---

**Last Review:** 2026-02-03  
**Next Review:** Monthly during Phase 1 (evolves as we learn)
