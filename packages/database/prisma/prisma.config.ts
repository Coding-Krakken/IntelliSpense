// TypeScript Prisma config. Kept minimal — runtime will use env var.
export default {
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? 'file:./dev.db'
    }
  }
}
