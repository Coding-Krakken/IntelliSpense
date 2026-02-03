module.exports = {
  datasource: {
    url: process.env.DATABASE_URL || 'file:./prisma/dev.db'
  }
}
