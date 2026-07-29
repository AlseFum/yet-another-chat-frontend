import { spawn } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
let stopping = false

function run(command, args) {
  const child = spawn(command, args, { stdio: 'inherit' })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

function wait(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

function stop(signal = 'SIGTERM') {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal))

const initialBuild = run(npm, ['run', 'web:build'])
const buildResult = await wait(initialBuild)
if (buildResult.code !== 0) process.exit(buildResult.code || 1)

const backend = run(process.execPath, ['scripts/backend-watch.js'])
const frontend = run(npm, ['run', 'web:build', '--', '--watch'])
const result = await Promise.race([wait(backend), wait(frontend)])
if (!stopping) {
  console.error(`开发进程已退出: ${result.signal || result.code}`)
  process.exitCode = result.code || 1
  stop()
}
