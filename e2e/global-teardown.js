const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

module.exports = async () => {
  const root = process.cwd()
  const artifactsPath = path.join(root, 'e2e', 'artifacts.json')
  if (!fs.existsSync(artifactsPath)) return
  const artifacts = JSON.parse(fs.readFileSync(artifactsPath, 'utf-8'))

  try {
    if (artifacts.apiPid) process.kill(artifacts.apiPid)
  } catch (e) {
    console.error('E2E global-teardown: failed to kill apiPid', e)
  }
  try {
    if (artifacts.webPid) process.kill(artifacts.webPid)
  } catch (e) {
    console.error('E2E global-teardown: failed to kill webPid', e)
  }

  // Tear down docker-compose services if present
  try {
    execSync('docker-compose -f docker-compose.dev.yml down', { stdio: 'inherit' })
  } catch (e) {
    console.error('E2E global-teardown: docker-compose down failed', e)
  }

  fs.unlinkSync(artifactsPath)
  console.log('E2E global-teardown: cleaned up')
}
