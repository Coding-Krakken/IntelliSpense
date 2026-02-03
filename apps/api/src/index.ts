import './tracing'
import express from 'express'
import { trace } from '@opentelemetry/api'
import cors from 'cors'
import dotenv from 'dotenv'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@intellispense/database'
import { z } from 'zod'
import jwt from 'jsonwebtoken'

dotenv.config()

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; organizationId: string }
    }
  }
}

dotenv.config()

const app = express()
app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3001', credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Simple request logger for observability (replace with proper tracing later)
app.use((req, _res, next) => {
  // attach request id for observability
  const traceId = uuidv4()
  ;(req as any).traceId = traceId
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ts: new Date().toISOString(), traceId, method: req.method, path: req.path }))
  next()
})

const port = Number(process.env.API_PORT || 4000)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m'
const REFRESH_TOKEN_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_MS || String(7 * 24 * 60 * 60 * 1000))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Auth: register + login with password (backwards-compatible demo fallback)
const RegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8), organizationSlug: z.string().optional() })
const LoginSchema = z.object({ email: z.string().email(), password: z.string().optional(), organizationSlug: z.string().optional() })

function createAccessToken(userId: string, orgId: string) {
  return (jwt as any).sign({ sub: userId, org: orgId }, JWT_SECRET as any, { expiresIn: ACCESS_TOKEN_EXPIRY } as any)
}

import refreshTokenService from './refreshTokenService'

async function createAndStoreRefreshToken(userId: string) {
  const { token, id } = await refreshTokenService.createTokenForUser(userId, REFRESH_TOKEN_TTL_MS)
  return { token, dbToken: { id, userId } }
}

function setRefreshCookie(res: express.Response, token: string) {
  const secure = process.env.NODE_ENV === 'production'
  res.cookie('isp_rt', token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_MS
  })
}

app.post('/api/register', async (req, res) => {
  try {
    const parsed = RegisterSchema.parse(req.body)
    const email = parsed.email.toLowerCase()
    const orgSlug = parsed.organizationSlug || 'demo'

    const org = await db.organization.upsert({ where: { slug: orgSlug }, create: { name: 'Demo Org', slug: orgSlug }, update: {} })

    const passwordHash = await bcrypt.hash(parsed.password, 10)
    const user = await db.user.create({ data: { email, name: email.split('@')[0], passwordHash } })

    await db.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } })

    const accessToken = createAccessToken(user.id, org.id)
    const { token: refreshToken } = await createAndStoreRefreshToken(user.id)
    setRefreshCookie(res, refreshToken)

    res.json({ accessToken })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const parsed = LoginSchema.parse(req.body)
    const email = parsed.email.toLowerCase()
    const orgSlug = parsed.organizationSlug || 'demo'

    // Demo fallback when password omitted: upsert user (legacy behavior)
    if (!parsed.password) {
      const org = await db.organization.upsert({ where: { slug: orgSlug }, create: { name: 'Demo Org', slug: orgSlug }, update: {} })
      const user = await db.user.upsert({ where: { email }, create: { email, name: email.split('@')[0] }, update: { name: email.split('@')[0] } })
      await db.organizationMembership.upsert({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } }, create: { organizationId: org.id, userId: user.id, role: 'OWNER' }, update: {} })

      const accessToken = createAccessToken(user.id, org.id)
      const { token: refreshToken } = await createAndStoreRefreshToken(user.id)
      setRefreshCookie(res, refreshToken)
      return res.json({ accessToken })
    }

    // Password login
    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'invalid credentials' })

    const ok = await bcrypt.compare(parsed.password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'invalid credentials' })

    // Resolve organization membership (use provided orgSlug or first membership)
    let orgId: string | null = null
    if (parsed.organizationSlug) {
      const org = await db.organization.findUnique({ where: { slug: parsed.organizationSlug } })
      orgId = org?.id ?? null
    }
    if (!orgId) {
      const membership = await db.organizationMembership.findFirst({ where: { userId: user.id } })
      orgId = membership?.organizationId ?? null
    }
    if (!orgId) return res.status(400).json({ error: 'no organization available for user' })

    const accessToken = createAccessToken(user.id, orgId)
    const { token: refreshToken } = await createAndStoreRefreshToken(user.id)
    setRefreshCookie(res, refreshToken)
    res.json({ accessToken })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// Auth middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'missing authorization' })
  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'invalid authorization' })
  try {
    const payload: any = jwt.verify(parts[1], JWT_SECRET)
    req.user = { id: payload.sub, organizationId: payload.org }
    next()
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' })
  }
}

app.get('/api/docs', (_req, res) => {
  res.json({ info: 'Minimal API - docs not implemented in scaffold' })
})

// Example endpoint used by the demo UI
const tracer = trace.getTracer('intellispense-api')
app.get('/api/profitability', async (_req, res) => {
  return tracer.startActiveSpan('calculate-profitability', async (span) => {
    try {
      const revenueAgg = await db.financialEvent.aggregate({
        _sum: { amount: true },
        where: { eventType: 'REVENUE' }
      })
      const costsAgg = await db.financialEvent.aggregate({
        _sum: { amount: true },
        where: { NOT: { eventType: 'REVENUE' } }
      })

      const revenue = Number(revenueAgg._sum.amount ?? 0)
      const costs = Number(costsAgg._sum.amount ?? 0)
      const margin = revenue - costs
      const marginPercent = revenue > 0 ? (margin / revenue) * 100 : null

      span.setAttribute('profitability.revenue', revenue)
      span.setAttribute('profitability.costs', costs)
      span.setAttribute('profitability.margin', margin)

      res.json({ revenue, costs, margin, marginPercent })
    } catch (e: any) {
      span.recordException(e)
      res.json({ revenue: 100000, costs: 42000, margin: 58000, marginPercent: 58, warning: 'db-unavailable' })
    } finally {
      span.end()
    }
  })
})

// Projects endpoints (require auth)
app.get('/api/projects', requireAuth, async (req, res) => {
  const orgId = req.user!.organizationId
  const projects = await db.project.findMany({ where: { organizationId: orgId } })
  res.json({ projects })
})

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  const orgId = req.user!.organizationId
  const id = req.params.id
  const project = await db.project.findUnique({ where: { id } })
  if (!project || project.organizationId !== orgId) return res.status(404).json({ error: 'not found' })
  res.json(project)
})

const CreateEventSchema = z.object({
  projectId: z.string().uuid().optional(),
  eventType: z.enum(["REVENUE", "LABOR_COST", "MATERIAL_COST", "OVERHEAD_COST", "EQUIPMENT_COST", "SUBCONTRACTOR_COST", "ADJUSTMENT", "FORECAST"]),
  amount: z.number(),
  description: z.string().optional()
})

app.post('/api/events', requireAuth, express.json(), async (req, res) => {
  try {
    const parsed = CreateEventSchema.parse(req.body)
    const orgId = req.user!.organizationId
    const userId = req.user!.id

    // Span for event ingestion
    const eventsTracer = trace.getTracer('intellispense-events')
    return eventsTracer.startActiveSpan('ingest-financial-event', async (span) => {
      try {
        span.setAttribute('event.type', parsed.eventType)
        span.setAttribute('event.amount', parsed.amount)

        const event = await db.financialEvent.create({
          data: {
            organizationId: orgId,
            eventType: parsed.eventType as any,
            timestamp: new Date(),
            amount: parsed.amount,
            description: parsed.description ?? '',
            sourceSystem: 'web-ui',
            sourceId: `manual-${Date.now()}`,
            createdBy: userId
          }
        })
        res.status(201).json(event)
      } catch (e: any) {
        span.recordException(e)
        res.status(400).json({ error: e.message })
      } finally {
        span.end()
      }
    })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// Refresh token endpoint - rotate refresh token, issue new access token
app.post('/api/token/refresh', async (req, res) => {
  try {
    const token = (req as any).cookies?.isp_rt
    if (!token) return res.status(401).json({ error: 'missing refresh token' })

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const dbToken = await refreshTokenService.findTokenByHash(tokenHash)
    if (!dbToken || dbToken.revoked) return res.status(401).json({ error: 'invalid refresh token' })
    if (dbToken.expiresAt.getTime() < Date.now()) return res.status(401).json({ error: 'expired refresh token' })

    const user = await db.user.findUnique({ where: { id: dbToken.userId } })
    if (!user) return res.status(401).json({ error: 'invalid user' })

    // Rotate: create new refresh token, revoke old
    const { token: newToken, dbToken: newDbToken } = await createAndStoreRefreshToken(user.id)
    await refreshTokenService.revokeTokenById(dbToken.id, newDbToken.id)

    setRefreshCookie(res, newToken)
    // Determine org to sign access token (use first membership)
    const membership = await db.organizationMembership.findFirst({ where: { userId: user.id } })
    const orgId = membership?.organizationId ?? ''
    const accessToken = createAccessToken(user.id, orgId)
    res.json({ accessToken })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// Logout - revoke refresh token and clear cookie
app.post('/api/logout', async (req, res) => {
  try {
    const token = (req as any).cookies?.isp_rt
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      await refreshTokenService.revokeTokensByHash(tokenHash)
    }
    res.clearCookie('isp_rt', { path: '/' })
    res.status(204).send(undefined)
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

// Projects CRUD: create, update, delete (org-scoped)
const CreateProjectSchema = z.object({ name: z.string().min(1), code: z.string().optional(), clientId: z.string().uuid().optional(), managerId: z.string().uuid().optional(), budget: z.number().optional(), description: z.string().optional() })
const UpdateProjectSchema = CreateProjectSchema.partial()

app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const payload = CreateProjectSchema.parse(req.body)
    const orgId = req.user!.organizationId
    const project = await db.project.create({ data: { organizationId: orgId, name: payload.name, code: payload.code, clientId: payload.clientId, managerId: payload.managerId, budget: payload.budget ? payload.budget.toString() : undefined, description: payload.description } })
    res.status(201).json(project)
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const payload = UpdateProjectSchema.parse(req.body)
    const orgId = req.user!.organizationId
    const id = req.params.id
    const project = await db.project.findUnique({ where: { id } })
    if (!project || project.organizationId !== orgId) return res.status(404).json({ error: 'not found' })
    const updated = await db.project.update({ where: { id }, data: { name: payload.name, code: payload.code, clientId: payload.clientId, managerId: payload.managerId, budget: payload.budget ? payload.budget.toString() : undefined, description: payload.description } })
    res.json(updated)
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const orgId = req.user!.organizationId
    const id = req.params.id
    const project = await db.project.findUnique({ where: { id } })
    if (!project || project.organizationId !== orgId) return res.status(404).json({ error: 'not found' })
    await db.project.delete({ where: { id } })
    res.status(204).send(undefined)
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${port}`)
})

// Start background jobs
import { startPruneJob } from './jobs/pruneRefreshTokens'
const pruneInterval = startPruneJob()
process.on('SIGTERM', () => {
  if (pruneInterval) clearInterval(pruneInterval)
})
