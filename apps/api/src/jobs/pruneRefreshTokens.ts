import refreshTokenService from '../refreshTokenService'

const PRUNE_INTERVAL_MS = Number(process.env.REFRESH_PRUNE_INTERVAL_MS || String(60 * 60 * 1000)) // hourly
const RETENTION_MS = Number(process.env.REFRESH_PRUNE_RETENTION_MS || String(7 * 24 * 60 * 60 * 1000)) // 7 days

export async function pruneOldRefreshTokens() {
  try {
    const deleted = await refreshTokenService.deleteOldTokens(RETENTION_MS)
    console.log(`Pruned ${deleted} refresh tokens older than ${RETENTION_MS}ms`)
  } catch (e) {
    console.error('Error pruning refresh tokens', e)
  }
}

export function startPruneJob() {
  // Run immediately, then schedule
  pruneOldRefreshTokens()
  return setInterval(pruneOldRefreshTokens, PRUNE_INTERVAL_MS)
}
