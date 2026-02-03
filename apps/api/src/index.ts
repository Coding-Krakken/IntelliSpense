import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { db } from '@intellispense/database'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const port = Number(process.env.API_PORT || 4000)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/docs', (_req, res) => {
  res.json({ info: 'Minimal API - docs not implemented in scaffold' })
})

// Example endpoint used by the demo UI
app.get('/api/profitability', async (_req, res) => {
  try {
    // Aggregate revenue and costs from FinancialEvent table
    const revenueAgg = await db.financialEvent.aggregate({
      where: { eventType: 'REVENUE' },
      _sum: { amount: true }
    })
    const costsAgg = await db.financialEvent.aggregate({
      where: { NOT: { eventType: 'REVENUE' } },
      _sum: { amount: true }
    })

    const revenue = Number(revenueAgg._sum.amount ?? 0)
    const costs = Number(costsAgg._sum.amount ?? 0)
    const margin = revenue - costs
    const marginPercent = revenue > 0 ? (margin / revenue) * 100 : null

    res.json({ revenue, costs, margin, marginPercent })
  } catch (e) {
    // Fallback if DB is not initialized
    res.json({ revenue: 100000, costs: 42000, margin: 58000, marginPercent: 58, warning: 'db-unavailable' })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${port}`)
})
