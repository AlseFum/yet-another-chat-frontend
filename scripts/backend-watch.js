import { spawn } from 'node:child_process'
import { readdirSync, watch } from 'node:fs'
import { join } from 'node:path'

const watchedRoots = ['backend', 'llm', 'util']
const watchers = []
let backend = null
let restarting = false
let stopping = false
let restartTimer = null

function start() {
  backend = spawn(process.execPath, ['backend/index.js'], { stdio: 'inherit' })
  backend.once('exit', code => {
    if (stopping) return
    if (restarting) {
      restarting = false
      start()
      return
    }
    process.exitCode = code || 1
    stop()
  })
}

function restart() {
  if (!backend || backend.exitCode !== null) return start()
  restarting = true
  backend.kill('SIGTERM')
}

function scheduleRestart() {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(restart, 100)
}

function watchTree(directory) {
  watchers.push(watch(directory, scheduleRestart))
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) watchTree(join(directory, entry.name))
  }
}

function stop() {
  if (stopping) return
  stopping = true
  clearTimeout(restartTimer)
  for (const watcher of watchers) watcher.close()
  backend?.kill('SIGTERM')
}

for (const root of watchedRoots) watchTree(root)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop())
start()
