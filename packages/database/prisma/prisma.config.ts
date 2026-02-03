// TypeScript Prisma config. Kept minimal — runtime will use env var.
const config = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? 'file:./dev.db'
    }
  }
}

export default config

// Backwards-compatible alias for tools expecting a singular `datasource` key
export const datasource = config.datasources.db
