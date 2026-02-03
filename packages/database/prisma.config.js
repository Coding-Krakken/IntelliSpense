// Ensure Prisma CLI (when run from package root) sees a `datasource.url`.
// This file is intentionally CommonJS so the Prisma CLI can load it without
// requiring TS transpilation.
module.exports = {
  // Singular form expected by some Prisma commands
  datasource: {
    url: process.env.DATABASE_URL || 'file:./prisma/dev.db'
  },

  // Backwards-compatible plural form used in other tooling
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./prisma/dev.db'
    }
  }
}
