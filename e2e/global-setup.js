const fs = require('fs')
const path = require('path')
const { spawnSync, spawn } = require('child_process')

module.exports = async () => {
  const root = process.cwd()
  const artifactsPath = path.join(root, 'e2e', 'artifacts.json')
  const logsDir = path.join(root, 'e2e', 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  const setupLogPath = path.join(logsDir, 'setup.log')
  // Truncate logs per run to avoid stale noise from previous attempts.
  const setupLog = fs.openSync(setupLogPath, 'w')
  console.log('E2E global-setup: starting Postgres and Redis using docker compose')

  // Isolate E2E docker resources from dev by using a dedicated compose project.
  // This prevents accidental reuse of a dev DB volume (schema drift) and avoids
  // teardown impacting a developer's local environment.
  const composeProjectName = process.env.COMPOSE_PROJECT_NAME || 'intellispense-e2e'
  function getComposeEnv(overrides = {}) {
    return { ...process.env, ...overrides, COMPOSE_PROJECT_NAME: composeProjectName }
  }

  function logLine(line) {
    try {
      fs.writeSync(setupLog, `${new Date().toISOString()} ${line}\n`)
    } catch {
      // best-effort
    }
  }

  function runComposeSync(args, options = {}) {
    const res = spawnSync('docker', ['compose', '-f', 'docker-compose.dev.yml', ...args], {
      ...options,
      env: options.env || getComposeEnv(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (res.status !== 0) {
      const fallback = spawnSync('docker-compose', ['-f', 'docker-compose.dev.yml', ...args], {
        ...options,
        env: options.env || getComposeEnv(),
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
      return { ...fallback, usedFallback: true }
    }
    return { ...res, usedFallback: false }
  }

  function looksLikePortCollision(stderr) {
    const s = String(stderr || '')
    return /port is already allocated|address already in use|Bind for/i.test(s)
  }

  function randomPort(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  function chooseDifferentRandomPort(min, max, usedPorts) {
    for (let i = 0; i < 50; i++) {
      const p = randomPort(min, max)
      if (!usedPorts.has(p)) return p
    }
    // Fallback: best-effort even if it collides; compose will tell us.
    return randomPort(min, max)
  }

  // Choose host ports (configurable via env; retry with random high ports if in use).
  let pgPort = Number(process.env.POSTGRES_PORT || 5432)
  let redisPort = Number(process.env.REDIS_PORT || 6379)

  // Ensure we start from a clean slate for deterministic E2E runs (safe due to compose project isolation).
  runComposeSync(['down', '-v'])

  let up
  for (let attempt = 0; attempt < 5; attempt++) {
    process.env.POSTGRES_PORT = String(pgPort)
    process.env.REDIS_PORT = String(redisPort)
    logLine(`docker compose up attempt=${attempt + 1} POSTGRES_PORT=${pgPort} REDIS_PORT=${redisPort}`)
    // Always force recreate so port changes apply on retries (otherwise compose may reuse
    // a previously-created container with stale port bindings).
    up = runComposeSync(['up', '-d', '--remove-orphans', '--force-recreate'])
    if (up.stdout) process.stdout.write(up.stdout)
    if (up.stderr) process.stderr.write(up.stderr)
    if (up.status === 0) break
    if (!looksLikePortCollision(up.stderr)) break

    const usedPorts = new Set([pgPort, redisPort])
    pgPort = chooseDifferentRandomPort(20000, 40000, usedPorts)
    usedPorts.add(pgPort)
    redisPort = chooseDifferentRandomPort(20000, 40000, usedPorts)
  }
  if (!up || up.status !== 0) {
    console.error('docker compose / docker-compose up failed')
    logLine(`docker compose up failed status=${up ? up.status : 'unknown'}`)
    if (up && up.stderr) logLine(String(up.stderr).slice(0, 4000))
    process.exit(1)
  }

  // Wait for Postgres to be ready before running migrations.
  console.log('E2E global-setup: waiting for Postgres readiness')
  function runCompose(args) {
    let res = spawnSync('docker', ['compose', '-f', 'docker-compose.dev.yml', ...args], { stdio: 'inherit', env: getComposeEnv() })
    if (res.status !== 0) {
      res = spawnSync('docker-compose', ['-f', 'docker-compose.dev.yml', ...args], { stdio: 'inherit', env: getComposeEnv() })
    }
    return res
  }
  let pgReady = false
  for (let i = 0; i < 60; i++) {
    // Use TCP readiness to match how Prisma connects (not just the local unix socket).
    const check = runCompose(['exec', '-T', 'postgres', 'pg_isready', '-U', 'intellispense', '-h', '127.0.0.1', '-p', '5432'])
    if (check.status === 0) {
      pgReady = true
      break
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!pgReady) {
    console.error('Postgres failed to become ready in time')
    process.exit(1)
  }

  // Also wait for the published host port to accept TCP connections.
  const net = require('net')
  async function waitForHostPort(host, port, attempts, delayMs) {
    for (let i = 0; i < attempts; i++) {
      const ok = await new Promise(resolve => {
        const socket = net.createConnection({ host, port })
        const done = result => {
          try { socket.destroy() } catch {}
          resolve(result)
        }
        socket.once('connect', () => done(true))
        socket.once('error', () => done(false))
        socket.setTimeout(500, () => done(false))
      })
      if (ok) return true
      await new Promise(r => setTimeout(r, delayMs))
    }
    return false
  }

  const hostPortReady = await waitForHostPort('127.0.0.1', pgPort, 60, 500)
  if (!hostPortReady) {
    console.error(`Postgres host port ${pgPort} did not become reachable in time`)
    process.exit(1)
  }

  // Wait briefly for services to be reachable on localhost
  const pgHost = '127.0.0.1'
  const DATABASE_URL = `postgresql://intellispense:intellispense_dev_password@${pgHost}:${pgPort}/intellispense_dev`
  console.log(`E2E global-setup: using DATABASE_URL=${DATABASE_URL}`)

  // Run migrations (use deploy for deterministic, non-interactive behavior)
  const skipMigrations = process.env.SKIP_DB_MIGRATIONS === 'true' && process.env.CI !== 'true'
  if (skipMigrations) {
    console.log('E2E global-setup: SKIP_DB_MIGRATIONS=true (non-CI), skipping migrations')
  } else {
    console.log('E2E global-setup: running migrations')
    const migrate = spawnSync('pnpm', ['--filter', '@intellispense/database', 'db:migrate:deploy'], { env: { ...process.env, DATABASE_URL }, stdio: 'inherit' })
    if (migrate.status !== 0) {
      console.error('Migrations failed')
      process.exit(1)
    }
  }

  // Ensure production builds exist (API start needs dist/, Next start needs .next/)
  console.log('E2E global-setup: ensuring production builds')
  const buildApi = spawnSync('pnpm', ['-w', '-F', '@intellispense/api', 'build'], { env: { ...process.env }, stdio: 'inherit' })
  if (buildApi.status !== 0) {
    console.error('API build failed')
    process.exit(1)
  }
  const buildWeb = spawnSync('pnpm', ['-w', '-F', '@intellispense/web-next', 'build'], { env: { ...process.env }, stdio: 'inherit' })
  if (buildWeb.status !== 0) {
    console.error('Web build failed')
    process.exit(1)
  }

  // Start API and web servers (capture logs)
  console.log('E2E global-setup: starting API and web')
  const apiOut = fs.openSync(path.join(logsDir, 'api.out.log'), 'w')
  const apiErr = fs.openSync(path.join(logsDir, 'api.err.log'), 'w')
  const webOut = fs.openSync(path.join(logsDir, 'web.out.log'), 'w')
  const webErr = fs.openSync(path.join(logsDir, 'web.err.log'), 'w')

  // Start as detached process groups so we can reliably terminate the full tree
  // (pnpm -> node -> server) on setup failure.
  const apiProc = spawn('pnpm', ['-w', '-F', '@intellispense/api', 'start'], {
    env: { ...process.env, DATABASE_URL, API_PORT: '4000' },
    detached: true,
    stdio: ['ignore', apiOut, apiErr]
  })
  const webProc = spawn('pnpm', ['-w', '-F', '@intellispense/web-next', 'start'], {
    env: { ...process.env, NEXT_PUBLIC_API_URL: 'http://localhost:4000', PORT: '3001' },
    detached: true,
    stdio: ['ignore', webOut, webErr]
  })

  function killProc(proc) {
    try {
      if (!proc || !proc.pid) return
      // Negative PID targets the process group on POSIX.
      process.kill(-proc.pid)
    } catch (e) {
      // best-effort cleanup
    }
  }

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
    killProc(apiProc)
    killProc(webProc)
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
