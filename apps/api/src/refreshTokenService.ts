import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@intellispense/database'

// Decide whether to use Prisma-backed refresh token storage.
// Priority (most to least):
// 1. Explicit env var `USE_PRISMA_REFRESH` = 'true'|'false'
// 2. Auto-detect presence of `db.refreshToken` model

let _usePrismaCache: boolean | null = null
async function detectUsePrisma(): Promise<boolean> {
  if (_usePrismaCache !== null) return _usePrismaCache
  const env = process.env.USE_PRISMA_REFRESH
  if (env === 'true') {
    _usePrismaCache = true
    return true
  }
  if (env === 'false') {
    _usePrismaCache = false
    return false
  }
  try {
    _usePrismaCache = !!(db as any).refreshToken
    return _usePrismaCache
  } catch (e) {
    _usePrismaCache = false
    return false
  }
}

// create token: returns { token, id }
export async function createTokenForUser(userId: string, expiresMs: number) {
  const token = crypto.randomBytes(48).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAtDate = new Date(Date.now() + expiresMs)
  const expiresAt = Date.now() + expiresMs
  const id = uuidv4()

  if (await detectUsePrisma()) {
    // prisma-backed
    await (db as any).refreshToken.create({ data: { id, userId, tokenHash, expiresAt: expiresAtDate } })
    return { token, id }
  }

  // fallback to local store
  const ts = await import('./tokenStore')
  ts.createTokenRow({ id, userId, tokenHash, expiresAt })
  return { token, id }
}

export async function findTokenByHash(hash: string) {
  if (await detectUsePrisma()) {
    const row = await (db as any).refreshToken.findUnique({ where: { tokenHash: hash } })
    return row || null
  }
  const ts = await import('./tokenStore')
  return ts.findTokenByHash(hash)
}

export async function revokeTokenById(id: string, replacedBy?: string) {
  if (await detectUsePrisma()) {
    await (db as any).refreshToken.update({ where: { id }, data: { revoked: true, replacedBy: replacedBy ?? null } })
    return
  }
  const ts = await import('./tokenStore')
  ts.revokeTokenById(id, replacedBy)
}

export async function revokeTokensByHash(hash: string) {
  if (await detectUsePrisma()) {
    await (db as any).refreshToken.updateMany({ where: { tokenHash: hash }, data: { revoked: true } })
    return
  }
  const ts = await import('./tokenStore')
  ts.revokeTokensByHash(hash)
}

export async function deleteOldTokens(retentionMs: number) {
  if (await detectUsePrisma()) {
    const cutoff = new Date(Date.now() - retentionMs)
    const res = await (db as any).refreshToken.deleteMany({ where: { OR: [{ revoked: true, createdAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }] } })
    return res.count || 0
  }
  const ts = await import('./tokenStore')
  return ts.deleteOldTokens(retentionMs)
}

export default { createTokenForUser, findTokenByHash, revokeTokenById, revokeTokensByHash, deleteOldTokens }
