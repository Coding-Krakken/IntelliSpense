const fs = require('fs')
const path = require('path')
const { GenericContainer } = require('testcontainers')
const { spawnSync, spawn } = require('child_process')

module.exports = async () => {
  const root = process.cwd()
  const artifactsPath = path.join(root, 'e2e', 'artifacts.json')
  console.log('E2E global-setup: using docker-compose to start Postgres and Redis')

  // Fallback to docker-compose for local/dev E2E (more predictable in CI environments)
  const up = spawnSync('docker-compose', ['-f', 'docker-compose.dev.yml', 'up', '-d'], { stdio: 'inherit' })
  if (up.status !== 0) {
    console.error('docker-compose up failed')
    process.exit(1)
  }

  // Wait briefly for services to be reachable on localhost
  const pgHost = 'localhost'
  const pgPort = 5432
  const redisHost = 'localhost'
  const redisPort = 6379

  const DATABASE_URL = `postgresql://intellispense:intellispense_dev_password@${pgHost}:${pgPort}/intellispense_dev`
  const REDIS_URL = `redis://${redisHost}:${redisPort}`

  // Run migrations (run directly in the database package so env is respected)
  if (process.env.SKIP_DB_MIGRATIONS === 'true') {
    console.log('E2E global-setup: SKIP_DB_MIGRATIONS=true, skipping migrations')
  } else {
    console.log('E2E global-setup: running migrations')
    const migrate = spawnSync('pnpm', ['--filter', '@intellispense/database', 'db:migrate'], { env: { ...process.env, DATABASE_URL }, stdio: 'inherit' })
    if (migrate.status !== 0) {
      console.error('Migrations failed')
      process.exit(1)
    }
  }

  // Start API and web servers (capture logs)
  console.log('E2E global-setup: starting API and web')
  const logsDir = path.join(root, 'e2e', 'logs')
  fs.mkdirSync(logsDir, { recursive: true })

  const apiOut = fs.openSync(path.join(logsDir, 'api.out.log'), 'a')
  const apiErr = fs.openSync(path.join(logsDir, 'api.err.log'), 'a')
  const webOut = fs.openSync(path.join(logsDir, 'web.out.log'), 'a')
  const webErr = fs.openSync(path.join(logsDir, 'web.err.log'), 'a')

  const apiProc = spawn('pnpm', ['-w', '-F', '@intellispense/api', 'start'], { env: { ...process.env, DATABASE_URL, PORT: '4000' }, detached: false, stdio: ['ignore', apiOut, apiErr] })
  const webProc = spawn('pnpm', ['-w', '-F', '@intellispense/web-next', 'start'], { env: { ...process.env, NEXT_PUBLIC_API_URL: 'http://localhost:4000', PORT: '3001' }, detached: false, stdio: ['ignore', webOut, webErr] })

  // Give servers time to boot and check health endpoints
  const maxAttempts = 60
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const http = require('http')
  async function check(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, res => {
        res.statusCode === 200 ? resolve(true) : reject(new Error('bad status ' + res.statusCode))
      })
      req.on('error', reject)
      req.setTimeout(2000, () => {
        req.destroy()
        reject(new Error('timeout'))
      })
    })
  }

  let apiReady = false
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await check('http://localhost:4000/api/health')
      await check('http://localhost:3001/')
      apiReady = true
      break
    } catch (err) {
      await wait(1000)
    }
  }
  if (!apiReady) {
    console.error('Servers failed to start; check e2e/logs for details')
    process.exit(1)
  }

  const artifacts = {
    pgId: null,
    redisId: null,
    apiPid: apiProc.pid,
    webPid: webProc.pid,
    logsDir
  }
  fs.writeFileSync(artifactsPath, JSON.stringify(artifacts))
  console.log('E2E global-setup: artifacts written', artifactsPath)
}
