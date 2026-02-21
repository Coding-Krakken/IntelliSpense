import express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const port = Number(process.env.WEB_PORT || 3000)

app.get('/', async (_req, res) => {
  const apiUrl = process.env.API_URL || 'http://localhost:4000'
  // Try to fetch API health for a small demo
  let apiHealth: string
  try {
    const r = await fetch(`${apiUrl}/api/health`)
    const json = await r.json()
    apiHealth = JSON.stringify(json)
  } catch {
    apiHealth = 'unavailable'
  }

  res.send(`
    <html>
      <head><title>IntelliSpense - Minimal Web</title></head>
      <body>
        <h1>IntelliSpense Minimal Web</h1>
        <p>API: <a href="${apiUrl}">${apiUrl}</a></p>
        <p>API health: <code>${apiHealth}</code></p>
        <p>Try the profitability endpoint: <a href="${apiUrl}/api/profitability">/api/profitability</a></p>
      </body>
    </html>
  `)
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Web server listening on http://localhost:${port}`)
})
