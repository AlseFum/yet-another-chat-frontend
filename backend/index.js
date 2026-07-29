import { BackendService, readRecord } from './service.js'
import { createBackendTransport } from './transport.js'
import { BackendJobManager } from './job-manager.js'
import { LLMKey } from '../llm/index.js'
import { JsonStore } from './json-store.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT || 1146)
const keyId = process.env.LLM_KEY_ID || 'deepseek'
const workspace = process.env.WORKSPACE || 'default'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const store = new JsonStore(resolve(root, process.env.DATA_DIR || 'data'))
const webDist = resolve(root, 'web', 'dist')
const jobs = new BackendJobManager({
  getKey: (workspace, id) => readRecord(store, workspace, 'keys')[id] || null,
  saveJob: async (workspace, snapshot) => {
    const snapshots = readRecord(store, workspace, 'jobs')
    snapshots[snapshot.id] = snapshot
    store.write(workspace, 'jobs', snapshots)
  },
})
if (process.env.LLM_API_KEY) {
  const key = new LLMKey({
    id: keyId,
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
    provider: process.env.LLM_PROVIDER || 'openai-compatible',
  })
  const keys = readRecord(store, workspace, 'keys')
  keys[key.id] = key
  store.write(workspace, 'keys', keys)
}
const service = new BackendService({
  jobs,
  store,
})
const { server } = createBackendTransport(service, { staticDir: webDist })
server.once('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`端口 ${port} 已被占用，请先停止旧后端进程!`)
  else console.error(error)
  process.exitCode = 1
})
server.listen(port, () => console.log(`Backend at http://localhost:${port}`))
