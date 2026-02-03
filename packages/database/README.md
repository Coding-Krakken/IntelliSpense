# @intellispense/database

Database package for IntelliSpense - Contains Prisma schema, migrations, and database utilities.

## Features

- **Event-Sourced Financial Ledger**: Immutable `FinancialEvent` table with temporal queries
- **Multi-Tenant Isolation**: Automatic `organizationId` filtering via Prisma middleware
- **Type-Safe Queries**: Generated Prisma Client with full TypeScript support
- **Audit Logging**: Automatic tracking of all write operations
- **Seed Data**: Realistic test data for development

## Installation

```bash
# From monorepo root
pnpm install

# Generate Prisma Client
pnpm db:generate

# Run migrations
pnpm db:migrate
```

## Database Commands

```bash
# Generate Prisma Client (run after schema changes)
pnpm db:generate

# Create a new migration
pnpm db:migrate

# Seed database with test data
pnpm db:seed

# Open Prisma Studio (database GUI)
pnpm db:studio

# Push schema to database (dev only, skips migrations)
pnpm db:push

# Reset database (DESTRUCTIVE - dev only)
pnpm db:reset
```

## Usage in Applications

```typescript
import { getPrismaClient, applyMultiTenantMiddleware, applyImmutabilityMiddleware } from '@intellispense/database'

// Create client with multi-tenant isolation
const prisma = getPrismaClient()
applyMultiTenantMiddleware(prisma, 'org-123')
applyImmutabilityMiddleware(prisma)

// All queries automatically filtered by organizationId
const projects = await prisma.project.findMany({
  where: { status: 'ACTIVE' }
  // organizationId: 'org-123' is added automatically
})

// Create financial event (immutable)
const event = await prisma.financialEvent.create({
  data: {
    organizationId: 'org-123',
    eventType: 'LABOR_COST',
    amount: -1500.00,
    timestamp: new Date(),
    projectId: 'project-abc',
    description: 'Carpenter labor - 40 hours',
    sourceSystem: 'TOGGL',
    sourceId: 'time-entry-789',
    createdBy: 'user-456'
  }
})

// Temporal query (point-in-time profitability)
import { temporalWhere } from '@intellispense/database'

const eventsAsOf = await prisma.financialEvent.findMany({
  where: {
    projectId: 'project-abc',
    ...temporalWhere(new Date('2024-01-31'))
  }
})
```

## Core Entities

### Organizations & Users
- **Organization**: Multi-tenant root entity
- **User**: System users (email/OAuth authentication)
- **OrganizationMembership**: User roles within organizations

### Project Management
- **Project**: Top-level work container
- **Task**: Project work breakdown structure
- **Client**: Project clients/customers
- **Employee**: Labor resources
- **CostCenter**: Overhead/indirect cost pools

### Financial Ledger
- **FinancialEvent**: Immutable financial transactions (append-only)
  - `REVENUE`: Income from clients
  - `LABOR_COST`: Employee time
  - `MATERIAL_COST`: Materials and supplies
  - `OVERHEAD_COST`: Allocated indirect costs
  - `EQUIPMENT_COST`: Equipment rental/usage
  - `SUBCONTRACTOR_COST`: External labor
  - `ADJUSTMENT`: Corrections (references original via `correctsEventId`)
  - `FORECAST`: AI-generated predictions
- **ProjectProfitabilitySnapshot**: Materialized profitability views

### Integrations
- **Integration**: External system connections (QuickBooks, Toggl, etc.)
- **SyncLog**: Sync operation history

### AI & Audit
- **AIDecision**: AI reasoning logs (cost attribution, explanations, forecasts)
- **AuditLog**: Security audit trail
- **Notification**: User notifications

## Schema Principles

### P1: Financial Events Are Immutable

Financial events **cannot be updated or deleted** after creation. This is enforced by:

1. Prisma middleware that blocks `update`/`delete` operations
2. Application-level guards

To correct an error:

```typescript
// ❌ WRONG: This will throw an error
await prisma.financialEvent.update({
  where: { id: 'event-123' },
  data: { amount: -2000 }  // BLOCKED!
})

// ✅ CORRECT: Create a correction event
await prisma.financialEvent.create({
  data: {
    organizationId: 'org-123',
    eventType: 'ADJUSTMENT',
    amount: -500,  // Difference only
    correctsEventId: 'event-123',
    description: 'Corrected labor hours from 30 to 40',
    sourceSystem: 'INTELLISPENSE',
    sourceId: `CORRECTION-event-123-${Date.now()}`,
    timestamp: new Date(),
    createdBy: 'user-456'
  }
})
```

### P2: Temporal Queries

Financial events use `validFrom` and `validTo` for point-in-time queries:

```typescript
// Query events as of January 31, 2024
const events = await prisma.financialEvent.findMany({
  where: {
    projectId: 'project-abc',
    validFrom: { lte: new Date('2024-01-31') },
    OR: [
      { validTo: null },
      { validTo: { gt: new Date('2024-01-31') } }
    ]
  }
})

// Or use the helper
import { temporalWhere } from '@intellispense/database'

const events = await prisma.financialEvent.findMany({
  where: {
    projectId: 'project-abc',
    ...temporalWhere(new Date('2024-01-31'))
  }
})
```

### P3: Multi-Tenant Security

**Every query MUST be scoped to an organizationId**. This is enforced by middleware:

```typescript
// ✅ CORRECT: Middleware applied at connection level
const prisma = getPrismaClient()
applyMultiTenantMiddleware(prisma, 'org-123')

// All queries automatically filtered
const projects = await prisma.project.findMany()
// SQL: SELECT * FROM projects WHERE organization_id = 'org-123'

// ❌ WRONG: Using client without middleware (data leak!)
const prisma = new PrismaClient()
const projects = await prisma.project.findMany()
// SQL: SELECT * FROM projects (RETURNS ALL ORGS' DATA!)
```

### P4: Idempotency

Use `sourceSystem` + `sourceId` for idempotent event ingestion:

```typescript
// Insert event (fails if duplicate)
await prisma.financialEvent.create({
  data: {
    organizationId: 'org-123',
    sourceSystem: 'QUICKBOOKS',
    sourceId: 'INV-2024-001',  // QuickBooks invoice ID
    // ...
  }
})

// Unique constraint ensures idempotency:
// @@unique([organizationId, sourceSystem, sourceId])
```

## Migrations

### Creating a Migration

1. Modify `prisma/schema.prisma`
2. Run: `pnpm db:migrate`
3. Provide a descriptive name: `add_project_budget_field`
4. Commit both `schema.prisma` and `migrations/` folder

### Migration Best Practices

- **Never edit existing migrations** (they're immutable like financial events!)
- **Add new migrations** to change schema
- **Test migrations** on a copy of production data
- **Use `Prisma.sql`** for complex data migrations
- **Add indexes** for query performance (see NON_FUNCTIONAL_REQUIREMENTS.md)

### Production Migrations

```bash
# In CI/CD pipeline or deployment script
DATABASE_URL="postgresql://..." pnpm db:migrate
```

## Performance Optimization

### Indexes

Critical indexes defined in `schema.prisma`:

```prisma
// Multi-tenant queries (EVERY table)
@@index([organizationId])

// Financial event queries (profitability calculation)
@@index([organizationId, projectId, timestamp])
@@index([projectId, validFrom, validTo])

// Project lookups
@@index([organizationId, status])

// Audit log queries
@@index([organizationId, timestamp])
```

### Query Optimization Tips

1. **Use select** to limit fields:
   ```typescript
   const projects = await prisma.project.findMany({
     select: { id: true, name: true, status: true }
   })
   ```

2. **Use include wisely** (avoid N+1):
   ```typescript
   const projects = await prisma.project.findMany({
     include: {
       client: true,
       financialEvents: {
         where: temporalWhere()
       }
     }
   })
   ```

3. **Use aggregations** for summaries:
   ```typescript
   const result = await prisma.financialEvent.aggregate({
     where: { projectId: 'project-abc' },
     _sum: { amount: true },
     _count: true
   })
   ```

4. **Use materialized snapshots** for dashboards:
   ```typescript
   // Don't recalculate on every page load
   const snapshot = await prisma.projectProfitabilitySnapshot.findFirst({
     where: { projectId: 'project-abc' },
     orderBy: { calculatedAt: 'desc' }
   })
   ```

## Testing

### Unit Tests

Use in-memory SQLite for fast tests:

```typescript
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./test.db'
    }
  }
})

beforeAll(async () => {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

### Integration Tests

Use Testcontainers for PostgreSQL:

```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql'

let container: PostgreSqlContainer
let prisma: PrismaClient

beforeAll(async () => {
  container = await new PostgreSqlContainer().start()
  
  process.env.DATABASE_URL = container.getConnectionString()
  
  prisma = new PrismaClient()
  await prisma.$connect()
})

afterAll(async () => {
  await prisma.$disconnect()
  await container.stop()
})
```

## Troubleshooting

### Prisma Client Not Found

```bash
# Regenerate client
pnpm db:generate
```

### Migration Conflicts

```bash
# Reset database (dev only - DESTRUCTIVE!)
pnpm db:reset

# Or manually resolve:
pnpm db:migrate resolve --applied "20240203_migration_name"
```

### Slow Queries

```typescript
// Enable query logging
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' }
  ]
})

prisma.$on('query', (e) => {
  console.log('Query:', e.query)
  console.log('Duration:', e.duration + 'ms')
})
```

## Related Documentation

- [SYSTEM_MODEL.md](../../../SYSTEM_MODEL.md) - Canonical data model
- [PRINCIPLES.md](../../../PRINCIPLES.md) - P1 (Immutability), P2 (Multi-tenancy)
- [DEVELOPMENT_PLAYBOOK.md](../../../DEVELOPMENT_PLAYBOOK.md) - Database patterns
- [Prisma Documentation](https://www.prisma.io/docs)

## License

Proprietary - IntelliSpense © 2024
