import { createServer } from 'node:http'
import express from 'express'
import { WebSocketServer } from 'ws'
import { LLMKey } from '../llm/index.js'
import { validWorkspace } from '../util/workspace.js'

function jobIds(query) {
  if (!query) return []
  return Array.isArray(query) ? query : [query]
}

function stateKeys(query) {
  return jobIds(query).filter(key => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key))
}

export function createBackendTransport(service, { staticDir = null } = {}) {
  if (!service) throw new TypeError('createBackendTransport 需要 BackendService')

  const app = express()
  const sseClients = new Map()
  let sequence = 0

  app.use(express.json({ limit: '10mb' }))
  app.param('workspace', (request, response, next, workspace) => {
    if (!validWorkspace(workspace)) return response.status(400).json({ error: 'workspace 无效' })
    next()
  })
  app.param('name', (request, response, next, name) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return response.status(400).json({ error: 'store name 无效' })
    next()
  })

  app.get('/:workspace/event', (request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.flushHeaders()
    response.write(': connected\n\n')
    const clients = sseClients.get(request.params.workspace) || new Set()
    clients.add(response)
    sseClients.set(request.params.workspace, clients)
    request.on('close', () => {
      clients.delete(response)
      if (!clients.size) sseClients.delete(request.params.workspace)
    })
  })

  app.post('/:workspace/job', async (request, response) => {
    response.status(202).json(await service.launchJob(request.params.workspace, request.body))
  })
  app.get('/:workspace/job', async (request, response) => {
    response.json(await service.getJobs(request.params.workspace, jobIds(request.query.id), { detail: request.query.detail === '1' || request.query.detail === 'true' }))
  })
  app.post('/:workspace/job/:jobId/abort', (request, response) => {
    const jobId = request.params.jobId
    response.status(service.abortJob(request.params.workspace, jobId) ? 202 : 404).json({ jobId })
  })
  app.delete('/:workspace/job/:jobId', (request, response) => {
    if (!service.cleanJob(request.params.workspace, request.params.jobId)) return response.status(409).json({ error: 'Job 仍在运行，不能清理' })
    response.json({ jobId: request.params.jobId, removed: true })
  })

  app.get('/:workspace/state', (request, response) => response.json(service.getState(request.params.workspace, {
    summary: request.query.summary === '1' || request.query.summary === 'true',
    keys: stateKeys(request.query.key),
  })))
  app.put('/:workspace/state', (request, response) => response.json(service.setState(request.params.workspace, request.body)))
  app.patch('/:workspace/state', (request, response) => response.json(service.patchState(request.params.workspace, request.body)))

  app.get('/:workspace/custom-settings', (request, response) => response.json(service.getCustomSettings(request.params.workspace)))
  app.put('/:workspace/custom-settings', (request, response) => response.json(service.setCustomSettings(request.params.workspace, request.body)))
  app.patch('/:workspace/custom-settings', (request, response) => response.json(service.patchCustomSettings(request.params.workspace, request.body)))

  app.get('/:workspace/key', (request, response) => response.json(service.listKeys(request.params.workspace)))
  app.put('/:workspace/key', (request, response) => {
    const key = new LLMKey(request.body)
    service.setKey(request.params.workspace, key)
    response.status(201).json({ id: key.id, provider: key.provider, baseUrl: key.baseUrl })
  })
  app.delete('/:workspace/key/:keyId', (request, response) => {
    response.status(service.deleteKey(request.params.workspace, request.params.keyId) ? 200 : 404).json({ keyId: request.params.keyId })
  })

  app.get('/:workspace/store', (request, response) => response.json(service.readAllStore(request.params.workspace)))
  app.put('/:workspace/store', (request, response) => response.json(service.writeAllStore(request.params.workspace, request.body)))
  app.get('/:workspace/store/:name', (request, response) => {
    const value = service.readStore(request.params.workspace, request.params.name)
    if (value === undefined) return response.status(404).json({ error: `Store ${request.params.name} 不存在` })
    response.json(value)
  })
  app.put('/:workspace/store/:name', (request, response) => response.json(service.writeStore(request.params.workspace, request.params.name, request.body)))
  app.patch('/:workspace/store/:name', (request, response) => response.json(service.patchStore(request.params.workspace, request.params.name, request.body)))
  app.delete('/:workspace/store/:name', (request, response) => response.json({ removed: service.removeStore(request.params.workspace, request.params.name) }))

  if (staticDir) {
    app.use(express.static(staticDir, { index: 'index.html' }))
    app.use((request, response, next) => {
      const acceptsHtml = request.method === 'GET' || request.method === 'HEAD'
        ? !request.path.split('/').at(-1).includes('.')
        : false
      if (!acceptsHtml) return next()
      response.sendFile('index.html', { root: staticDir }, error => error && next(error))
    })
  }

  app.use((_request, response) => response.status(404).json({ error: '路径不存在' }))
  app.use((error, _request, response, _next) => {
    const status = error.statusCode || (error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500)
    response.status(status).json({ error: status === 500 ? '服务器内部错误' : error.message })
  })

  const server = createServer(app)
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
  server.on('upgrade', (request, socket, head) => {
    try {
      const match = new URL(request.url, 'http://localhost').pathname.match(/^\/([^/]+)\/ws$/)
      const workspace = match && decodeURIComponent(match[1])
      if (!validWorkspace(workspace)) return socket.destroy()
      wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, workspace))
    } catch {
      socket.destroy()
    }
  })
  wss.on('connection', (socket, workspace) => {
    socket.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString())
        if (message.type === 'job.abort') socket.send(JSON.stringify({ type: 'job.abort', jobId: message.jobId, ok: service.abortJob(workspace, message.jobId) }))
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', error: error.message }))
      }
    })
  })

  const subscription = service.onJobEvent(({ workspace, ...message }) => {
    const payload = `id: ${++sequence}\nevent: job\ndata: ${JSON.stringify(message)}\n\n`
    for (const response of sseClients.get(workspace) || []) response.write(payload)
  })

  return {
    app,
    server,
    close() {
      subscription.unsubscribe()
      for (const clients of sseClients.values()) for (const response of clients) response.end()
      for (const socket of wss.clients) socket.terminate()
      wss.close()
      server.close()
    },
  }
}
