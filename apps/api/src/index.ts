import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
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
app.use(cors())
app.use(express.json())

const port = Number(process.env.API_PORT || 4000)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Auth: POST /api/login -> { token }
const LoginSchema = z.object({ email: z.string().email(), organizationSlug: z.string().optional() })

app.post('/api/login', async (req, res) => {
  try {
    const parsed = LoginSchema.parse(req.body)
    const email = parsed.email
    const orgSlug = parsed.organizationSlug || 'demo'

    // Upsert organization (simple demo org)
    const org = await db.organization.upsert({
      where: { slug: orgSlug },
      create: { name: 'Demo Org', slug: orgSlug },
      update: {}
    })

    // Upsert user
    const user = await db.user.upsert({
      where: { email },
      create: { email, name: email.split('@')[0] },
      update: { name: email.split('@')[0] }
    })

    // Ensure membership
    await db.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
      create: { organizationId: org.id, userId: user.id, role: 'OWNER' },
      update: {}
    })

    const token = jwt.sign({ sub: user.id, org: org.id }, JWT_SECRET, { expiresIn: '8h' })
    res.json({ token })
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
app.get('/api/profitability', async (_req, res) => {
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

    res.json({ revenue, costs, margin, marginPercent })
  } catch (e) {
    res.json({ revenue: 100000, costs: 42000, margin: 58000, marginPercent: 58, warning: 'db-unavailable' })
  }
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
    res.status(400).json({ error: e.message })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${port}`)
})
