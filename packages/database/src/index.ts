/**
 * Database Package Entry Point
 * Exports Prisma client and types for use across the monorepo
 */

export * from '@prisma/client'
export { PrismaClient } from '@prisma/client'

/**
 * Create a new Prisma client instance with default configuration
 */
import { PrismaClient, Prisma } from '@prisma/client'
import postgres from 'postgres'
import { PrismaPostgres } from 'prisma-adapter-postgres'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

let prisma: PrismaClient

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

/**
 * Singleton Prisma client instance
 * In development, this prevents multiple instances due to hot reloading
 */
export function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    if (!prisma) {
      // prefer official adapter if available
      try {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
        const adapterFactory = new PrismaPg(pool as any)
        prisma = new PrismaClient({ adapter: adapterFactory } as any)
      } catch (err) {
        const sql = postgres(process.env.DATABASE_URL || '')
        const adapter = new PrismaPostgres(sql as any)
        prisma = new PrismaClient({ adapter } as any)
      }
    }
    return prisma
  } else {
    // Development: use global variable to prevent multiple instances
    if (!global.__prisma) {
      try {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
        const adapterFactory = new PrismaPg(pool as any)
        // Enable query logging in development for debugging adapter/FK issues
        global.__prisma = new PrismaClient({ adapter: adapterFactory, log: ['query', 'info', 'warn', 'error'] } as any)
      } catch (err) {
        const sql = postgres(process.env.DATABASE_URL || '')
        const adapter = new PrismaPostgres(sql as any)
        global.__prisma = new PrismaClient({ adapter, log: ['query', 'info', 'warn', 'error'] } as any)
      }
    }
    return global.__prisma
  }
}

/**
 * Prisma middleware for enforcing multi-tenant isolation
 * CRITICAL: Ensures all queries are scoped to organizationId
 */
export function applyMultiTenantMiddleware(
  client: PrismaClient,
  organizationId: string
): PrismaClient {
  const multiTenantModels = new Set([
    'Project',
    'Task',
    'Client',
    'Employee',
    'CostCenter',
    'FinancialEvent',
    'Integration',
    'AIDecision',
    'Notification',
    'SyncLog',
  ])

  const extended = client.$extends({
    query: {
      $allModels: {
        $allOperations: async ({ args, model, operation, query }: any) => {
          if (!multiTenantModels.has(model)) return query(args)

          args = args ?? {}

          const readOps = new Set([
            'findUnique',
            'findFirst',
            'findMany',
            'count',
            'aggregate',
            'groupBy',
          ])

          if (readOps.has(operation)) {
            const a = args as any
            a.where = a.where ?? {}
            if (a.where && a.where.organizationId === undefined) {
              a.where.organizationId = organizationId
            }
            return query(args)
          }

          if (operation === 'create') {
            const a = args as any
            a.data = a.data ?? {}
            if (a.data.organizationId === undefined) {
              a.data.organizationId = organizationId
            }
            return query(a)
          }

          if (operation === 'createMany') {
            const a = args as any
            a.data = a.data ?? []
            if (Array.isArray(a.data)) {
              a.data = a.data.map((d: any) =>
                d.organizationId === undefined ? { ...d, organizationId } : d
              )
            }
            return query(a)
          }

          const writeOps = new Set(['update', 'updateMany', 'upsert', 'delete', 'deleteMany'])
          if (writeOps.has(operation)) {
            const a = args as any
            a.where = a.where ?? {}
            if (a.where.organizationId === undefined) {
              a.where.organizationId = organizationId
            }
            if (operation === 'upsert') {
              a.create = a.create ?? {}
              if (a.create.organizationId === undefined) {
                a.create.organizationId = organizationId
              }
            }
            return query(a)
          }

          return query(args)
        },
      },
    },
  })

  return extended as unknown as PrismaClient
}

/**
 * Prisma middleware for immutable FinancialEvent enforcement
 * CRITICAL: Prevents updates/deletes of financial events (append-only ledger)
 */
export function applyImmutabilityMiddleware(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    query: {
      $allModels: {
        $allOperations: async ({ args, model, operation, query }: any) => {
          if (model !== 'FinancialEvent') return query(args)

          const mutating = new Set(['update', 'updateMany', 'delete', 'deleteMany'])
          if (mutating.has(operation)) {
            throw new Error('FinancialEvent is immutable. Use correction events instead of modifying ledger entries.')
          }

          if (operation === 'upsert') {
            const a = args as any
            if (a && a.update) {
              throw new Error('FinancialEvent is immutable. Upsert update branch is not allowed.')
            }
          }

          return query(args)
        },
      },
    },
  })

  return extended as unknown as PrismaClient
}

/**
 * Audit logging middleware
 * Tracks all write operations for compliance
 */
export function applyAuditMiddleware(
  client: PrismaClient,
  userId: string | null,
  organizationId: string
): PrismaClient {
  const mutatingOps = new Set([
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
  ])

  const extended = client.$extends({
    query: {
      $allModels: {
        $allOperations: async ({ args, model, operation, query }) => {
          const result = await query(args)

          try {
            if (process.env.DISABLE_AUDIT === '1') return result

            if (!mutatingOps.has(operation)) return result

            // Build a minimal audit entry
            const a = args as any
            const auditEntry: any = {
              organizationId,
              userId: userId ?? undefined,
              action: operation,
              entityType: model,
              entityId: (a && a.where && a.where.id) || null,
              changes: JSON.stringify({ args: a }),
              result: 'SUCCESS',
              timestamp: new Date(),
            }

            // Create audit record using client while disabling audit recursion
            const prev = process.env.DISABLE_AUDIT
            process.env.DISABLE_AUDIT = '1'
            try {
              const auditClient = getPrismaClient()
              // If AuditLog model exists, create entry; protect with try/catch if schema differs
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore: dynamic model access for audit
              if ((auditClient as any).auditLog) {
                // Use createMany for array results, create otherwise
                await (auditClient as any).auditLog.create({ data: auditEntry })
              }
            } finally {
              if (prev === undefined) delete process.env.DISABLE_AUDIT
              else process.env.DISABLE_AUDIT = prev
            }
          } catch (err) {
            // Do not block original operation on audit failures; log to console for now
            // In production, hook into structured logger/tracing
            // eslint-disable-next-line no-console
            console.warn('Audit middleware failed:', (err as Error).message)
          }

          return result
        },
      },
    },
  })

  return extended as unknown as PrismaClient
}

/**
 * Type helper for temporal queries
 * Use this to query financial events at a specific point in time
 */
export function temporalWhere(asOfDate: Date = new Date()): Prisma.FinancialEventWhereInput {
  return {
    validFrom: { lte: asOfDate },
    OR: [
      { validTo: null },
      { validTo: { gt: asOfDate } },
    ],
  }
}

/**
 * Type helper for creating correction events
 */
export function createCorrectionEvent(
  originalEventId: string,
  newAmount: number,
  reason: string,
  userId: string
): Prisma.FinancialEventCreateInput {
  return {
    eventType: 'ADJUSTMENT',
    amount: newAmount,
    description: `Correction: ${reason}`,
    correctsEventId: originalEventId,
    sourceSystem: 'INTELLISPENSE',
    sourceId: `CORRECTION-${originalEventId}-${Date.now()}`,
    timestamp: new Date(),
    createdBy: { connect: { id: userId } },
    organization: { connect: { id: '' } }, // Must be provided by caller
  } as any
}

// Export default instance
export const db = getPrismaClient()
