import { WebSocketServer, WebSocket } from 'ws'
import { createConversationEngine } from './conversation-engine.js'
import { validWorkspace } from '../util/index.js'
import { jobSummary } from '../llm/job-summary.js'

export function attachWebSocketServer(server, store, jobs) {
  const clients = new Map()
  const publish = (workspace, message) => {
    const payload = JSON.stringify(message)
    for (const socket of clients.get(workspace) || []) if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
  const engine = createConversationEngine(store, publish, jobs)
  const wss = new WebSocketServer({ noServer: true })

  jobs.subscribe(({ workspace, job, event }) => publish(workspace, { type: 'job', job, event }))

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost')
    const workspace = url.searchParams.get('workspace')
    if (url.pathname !== '/ws' || !validWorkspace(workspace)) return socket.destroy()
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, workspace))
  })

  wss.on('connection', (socket, workspace) => {
    const group = clients.get(workspace) || new Set()
    group.add(socket)
    clients.set(workspace, group)
    socket.send(JSON.stringify({ type: 'ready' }))
    socket.on('message', async raw => {
      let message
      try { message = JSON.parse(raw.toString()) } catch { return }
      try {
        if (message.type === 'send' && message.convId && typeof message.text === 'string' && message.text.trim()) await engine.start(workspace, message.convId, message.text.trim())
        if (message.type === 'stop' && message.convId) engine.stop(workspace, message.convId, 'client-stop')
        if (message.type === 'subscribe' && message.convId) engine.snapshot(workspace, message.convId)
        if (message.type === 'sync-jobs') socket.send(JSON.stringify({ type: 'jobs', jobs: store.read(workspace, 'llm-jobs').map(jobSummary) }))
        if (message.type === 'stop-job' && message.jobId) jobs.stop(message.jobId)
      } catch (error) { socket.send(JSON.stringify({ type: 'error', convId: message.convId, message: error.message })) }
    })
    socket.on('close', () => {
      // A client observes proxy jobs but does not own them. Keep server jobs
      // running so a reconnect can restore their JobMirror from persistence.
      group.delete(socket)
      if (!group.size) clients.delete(workspace)
    })
  })
}
