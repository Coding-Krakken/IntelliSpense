// Minimal Prisma v7 configuration to provide datasource URLs at runtime.
// Prisma will prefer TS config if available; a plain JS file is the safest
// fallback for CI environments.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set for Prisma datasource configuration')
}

module.exports = {
  datasources: {
    db: {
      url: databaseUrl
    }
  }
}

// Backwards-compatible alias for tools expecting a singular `datasource` key
module.exports.datasource = module.exports.datasources.db
