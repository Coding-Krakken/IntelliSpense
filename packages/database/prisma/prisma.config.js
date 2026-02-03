// Minimal Prisma v7 configuration to provide datasource URLs at runtime.
// Prisma will prefer TS config if available; a plain JS file is the safest
// fallback for CI environments.
module.exports = {
  datasources: {
    db: {
      // Prefer env var, fall back to a local sqlite file for offline operations.
      url: process.env.DATABASE_URL || 'file:./dev.db'
    }
  }
}
