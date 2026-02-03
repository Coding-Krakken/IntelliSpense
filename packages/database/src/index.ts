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
      prisma = new PrismaClient()
    }
    return prisma
  } else {
    // Development: use global variable to prevent multiple instances
    if (!global.__prisma) {
      global.__prisma = new PrismaClient()
    }
    return global.__prisma
  }
}

/**
 * Prisma middleware for enforcing multi-tenant isolation
 * CRITICAL: Ensures all queries are scoped to organizationId
 */
export function applyMultiTenantMiddleware(
  _client: PrismaClient,
  _organizationId: string
) {
  // Middleware implementation deferred for Prisma v7 migration.
  // TODO: Re-implement multi-tenant middleware using the Prisma v7 middleware API.
  return
}

/**
 * Prisma middleware for immutable FinancialEvent enforcement
 * CRITICAL: Prevents updates/deletes of financial events (append-only ledger)
 */
export function applyImmutabilityMiddleware(_client: PrismaClient) {
  // Middleware implementation deferred for Prisma v7 migration.
  // TODO: Re-implement immutability middleware using the Prisma v7 middleware API.
  return
}

/**
 * Audit logging middleware
 * Tracks all write operations for compliance
 */
export function applyAuditMiddleware(
  _client: PrismaClient,
  _userId: string,
  _organizationId: string
) {
  // Middleware implementation deferred for Prisma v7 migration.
  // TODO: Re-implement audit middleware using the Prisma v7 middleware API.
  return
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
