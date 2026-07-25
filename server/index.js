import { existsSync, watch } from 'fs'
import { exec } from 'child_process'
import express from 'express'
import { createServer } from 'http'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createApp } from './app.js'
import { createJsonStore } from './storage/json-store.js'
import { attachWebSocketServer } from './ws.js'
import { createLLMFetch, createLLMJobManager } from '../llm/index.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const port = process.env.PORT || 1145
const store = createJsonStore(join(root, 'data'))
const jobs = createLLMJobManager(store, createLLMFetch({ resolveKey: config => store.read(config.workspace, 'api-keys').find(item => item.id === config.keyId) }))
const app = createApp(store, jobs)
const server = createServer(app)
attachWebSocketServer(server, store, jobs)
const dist = join(root, 'web', 'dist')

if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')))
}

if (!process.argv.includes('--no-watch') && existsSync(join(root, 'web', 'src'))) {
  let timer
  watch(join(root, 'web', 'src'), { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(() => exec('npm run build', { cwd: root }), 5000)
  })
}

server.listen(port, '0.0.0.0', () => console.log(`Server at http://localhost:${port}`))

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void store.flushAll().finally(() => process.exit(0))
})
