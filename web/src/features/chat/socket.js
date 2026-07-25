import { getWorkspace } from '../../lib/api.js'
import { toast } from '../../components/Toast.vue'

export function createConversationSocket(workspace, ui, jobs) {
  let socket = null
  let retryTimer = null
  let retries = 0
  let closed = false
  const queued = []

  function appendDelta(convId, delta, reasoningDelta = '') {
    const conv = workspace.getConv(convId)
    const index = conv?.messages.length - 1
    const current = conv?.messages[index]
    if (!current || current.role !== 'assistant') return
    const cot = reasoningDelta ? `${current.cot || ''}${reasoningDelta}` : current.cot
    conv.messages.splice(index, 1, {
      ...current,
      content: `${current.content || ''}${delta || ''}`,
      rawContent: `${current.rawContent || ''}${delta || ''}`,
      cot,
      thoughts: cot ? [cot] : current.thoughts,
    })
  }

  function apply(message) {
    if (message.type === 'job') {
      jobs?.applyServer(message)
      if (message.event?.type === 'delta' && message.job?.context?.conversationId) {
        appendDelta(message.job.context.conversationId, message.event.content, message.event.reasoning)
      }
      return
    }
    if (message.type === 'jobs') {
      jobs?.restore?.(message.jobs)
      return
    }
    let conv = workspace.getConv(message.convId)
    if (message.type === 'snapshot' && message.conversation) {
      if (conv) Object.assign(conv, message.conversation)
      else {
        // A reply can arrive after reload/reconnect before local resource sync.
        // Do not discard the authoritative server snapshot in that window.
        conv = message.conversation
        workspace.conversations.push(conv)
        workspace.activeId ||= conv.id
      }
      const running = new Set(ui.runningConvIds)
      if (message.loading) running.add(message.convId)
      else running.delete(message.convId)
      ui.runningConvIds = [...running]
      // A server-side job can outlive a reload. When the local active
      // conversation has been recreated or diverged, surface the conversation
      // that is actually receiving the streamed response.
      if (message.loading && workspace.activeId !== message.convId && !workspace.getConv(workspace.activeId)?.messages?.length) workspace.activeId = message.convId
      ui.loading = message.loading && workspace.activeId === message.convId
    }
    if (message.type === 'chunk' && conv?.messages[message.index]) {
      appendDelta(message.convId, message.delta, message.reasoningDelta)
    }
    if (message.type === 'tool-call' && conv?.messages[message.index]) Object.assign(conv.messages[message.index], { toolCall: { name: message.name, args: message.args }, content: `调用工具: ${message.name}` })
    if (message.type === 'tool-result' && conv?.messages[message.index]) conv.messages[message.index].toolResult = message.result
    if (message.type === 'error') toast.error(message.error || '对话请求失败')
    if (message.type === 'done' || message.type === 'error') {
      ui.runningConvIds = ui.runningConvIds.filter(id => id !== message.convId)
      if (workspace.activeId === message.convId) ui.loading = false
    }
  }

  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    // A delayed stop can cancel a later turn after reconnect. It is safer to
    // drop it when disconnected than to apply it to an unknown future job.
    else if (message.type !== 'stop' && message.type !== 'stop-job') queued.push(message)
  }

  function connect() {
    if (closed) return
    clearTimeout(retryTimer)
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${protocol}//${location.host}/ws?workspace=${encodeURIComponent(getWorkspace())}`)
    socket.onopen = () => {
      retries = 0
      for (const conv of workspace.conversations) send({ type: 'subscribe', convId: conv.id })
      send({ type: 'sync-jobs' })
      while (queued.length) send(queued.shift())
    }
    socket.onmessage = event => {
      try { apply(JSON.parse(event.data)) } catch (error) { toast.error(`无法处理服务端消息: ${error.message}`) }
    }
    socket.onclose = () => {
      if (closed) return
      const delay = Math.min(1000 * 2 ** retries++, 10000)
      retryTimer = setTimeout(connect, delay)
    }
  }

  connect()
  return {
    send(convId, text) { ui.loading = workspace.activeId === convId; send({ type: 'send', convId, text }) },
    stop(convId) { send({ type: 'stop', convId }) },
    subscribe(convId) { send({ type: 'subscribe', convId }) },
    sync() { for (const conv of workspace.conversations) send({ type: 'subscribe', convId: conv.id }) },
    syncJobs() { send({ type: 'sync-jobs' }) },
    stopJob(jobId) { send({ type: 'stop-job', jobId }) },
    // Closing the observer never sends stop: proxy jobs remain server-owned.
    close() { closed = true; clearTimeout(retryTimer); socket?.close(); socket = null },
  }
}
