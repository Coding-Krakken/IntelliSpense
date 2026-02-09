import path from 'path'
import { mkdirSync } from 'fs'

function loadBetterSqlite3(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('better-sqlite3')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `SQLite refresh-token fallback requires optional dependency "better-sqlite3". ` +
        `Install it (or set USE_PRISMA_REFRESH=true). Original error: ${message}`
    )
  }
}

const dbPath = process.env.REFRESH_SQLITE_PATH || path.join(process.cwd(), 'data', 'refresh_tokens.sqlite')

mkdirSync(path.dirname(dbPath), { recursive: true })

const Database = loadBetterSqlite3()

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.prepare(
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    tokenHash TEXT NOT NULL UNIQUE,
    expiresAt INTEGER NOT NULL,
    revoked INTEGER DEFAULT 0,
    createdAt INTEGER NOT NULL,
    replacedBy TEXT
  )`
).run()

export function createTokenRow({ id, userId, tokenHash, expiresAt }: { id: string; userId: string; tokenHash: string; expiresAt: number }) {
  const stmt = db.prepare(`INSERT INTO refresh_tokens (id,userId,tokenHash,expiresAt,revoked,createdAt) VALUES (?,?,?,?,0,?)`)
  stmt.run(id, userId, tokenHash, expiresAt, Date.now())
}

export function findTokenByHash(tokenHash: string) {
  const row: any = db.prepare(`SELECT * FROM refresh_tokens WHERE tokenHash = ?`).get(tokenHash)
  if (!row) return null
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: new Date(row.expiresAt),
    revoked: !!row.revoked,
    createdAt: new Date(row.createdAt),
    replacedBy: row.replacedBy
  }
}

export function revokeTokenById(id: string, replacedBy?: string) {
  db.prepare(`UPDATE refresh_tokens SET revoked = 1, replacedBy = ? WHERE id = ?`).run(replacedBy || null, id)
}

export function revokeTokensByHash(tokenHash: string) {
  db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE tokenHash = ?`).run(tokenHash)
}

export function deleteOldTokens(cutoffMs: number) {
  const cutoff = Date.now() - cutoffMs
  const info = db.prepare(`DELETE FROM refresh_tokens WHERE (revoked = 1 AND createdAt < ?) OR (expiresAt < ?)`).run(cutoff, cutoff)
  return info.changes
}

export default db
