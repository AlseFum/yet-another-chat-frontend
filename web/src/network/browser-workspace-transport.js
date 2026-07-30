import { Subject } from 'rxjs'

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// -----------------------------------------------------------------------------
// 响应处理
// -----------------------------------------------------------------------------

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/$/, '')
}

const readBody = response => (response.headers.get('content-type') || '').includes('application/json')
  ? response.json().catch(() => null)
  : response.text().catch(() => '')

export class BrowserWorkspaceTransport {
  constructor({ workspace, baseUrl = import.meta.env.VITE_BACKEND_URL || '' } = {}) {
    if (!/^[a-zA-Z0-9_-]+$/.test(workspace || '')) throw new TypeError('workspace 无效')
    this.workspace = workspace
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.workspaceUrl = `${this.baseUrl}/${encodeURIComponent(workspace)}`
    this.events = new Subject()
    this.eventSource = null
    this.eventReady = null
    this.socket = null
  }

  // ---------------------------------------------------------------------------
  // HTTP 请求
  // ---------------------------------------------------------------------------

  url(path = '') { return `${this.workspaceUrl}${path}` }

  async request(path, { method = 'GET', body } = {}) {
    let response
    try {
      response = await fetch(this.url(path), {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      throw new ApiError(`网络请求失败: ${error.message}`, { body: error })
    }
    const value = await readBody(response)
    if (!response.ok) throw new ApiError(value?.error || `请求失败: ${response.status}`, { status: response.status, body: value })
    return value
  }

  // ---------------------------------------------------------------------------
  // 实时事件连接
  // ---------------------------------------------------------------------------

  async connect() {
    await this.connectEvents()
    this.connectSocket()
  }

  connectEvents() {
    if (this.eventSource) return this.eventReady || Promise.resolve()
    const source = new EventSource(this.url('/event'))
    this.eventReady = new Promise(resolve => source.addEventListener('open', resolve, { once: true }))
    source.addEventListener('job', event => {
      try { this.events.next(JSON.parse(event.data)) } catch (error) { this.events.next({ type: 'transport.error', error: error.message }) }
    })
    source.onerror = () => this.events.next({ type: 'transport.error', error: 'SSE 连接中断，正在重连' })
    this.eventSource = source
    return this.eventReady
  }

  connectSocket() {
    if (this.socket || typeof WebSocket === 'undefined') return
    const origin = this.baseUrl || window.location.origin
    const wsUrl = `${origin.replace(/^http/, 'ws')}/${encodeURIComponent(this.workspace)}/ws`
    const socket = new WebSocket(wsUrl)
    socket.onmessage = message => {
      try { this.events.next(JSON.parse(message.data)) } catch (error) { this.events.next({ type: 'transport.error', error: error.message }) }
    }
    socket.onerror = () => this.events.next({ type: 'transport.error', error: 'WebSocket 连接不可用，将使用 HTTP' })
    socket.onclose = () => { if (this.socket === socket) this.socket = null }
    this.socket = socket
  }

  // ---------------------------------------------------------------------------
  // Workspace API
  // ---------------------------------------------------------------------------

  loadState({ summary = false, keys = [] } = {}) {
    const query = new URLSearchParams()
    if (summary) query.set('summary', '1')
    for (const key of keys) query.append('key', key)
    const suffix = query.size ? `?${query}` : ''
    return this.request(`/state${suffix}`)
  }
  saveState(state) { return this.request('/state', { method: 'PUT', body: state }) }
  patchState(state) { return this.request('/state', { method: 'PATCH', body: state }) }

  loadCustomSettings() { return this.request('/custom-settings') }
  saveCustomSettings(settings) { return this.request('/custom-settings', { method: 'PUT', body: settings }) }
  patchCustomSettings(settings) { return this.request('/custom-settings', { method: 'PATCH', body: settings }) }

  listKeys() { return this.request('/key') }
  saveKey(key) { return this.request('/key', { method: 'PUT', body: key }) }
  deleteKey(keyId) { return this.request(`/key/${encodeURIComponent(keyId)}`, { method: 'DELETE' }) }

  loadJobs(ids, { detail = false } = {}) {
    const query = new URLSearchParams()
    for (const id of ids) query.append('id', id)
    if (detail) query.set('detail', '1')
    return this.request(`/job?${query}`)
  }
  launchJob(input) { return this.request('/job', { method: 'POST', body: input }) }
  cleanJob(jobId) { return this.request(`/job/${encodeURIComponent(jobId)}`, { method: 'DELETE' }) }

  async abortJob(jobId) {
    if (this.socket?.readyState === globalThis.WebSocket?.OPEN) {
      this.socket.send(JSON.stringify({ type: 'job.abort', jobId }))
      return { jobId, requested: true, via: 'ws' }
    }
    return this.request(`/job/${encodeURIComponent(jobId)}/abort`, { method: 'POST' })
  }

  // ---------------------------------------------------------------------------
  // 通用 Store API 与生命周期
  // ---------------------------------------------------------------------------

  readStore(name) { return this.request(`/store/${encodeURIComponent(name)}`) }
  writeStore(name, value) { return this.request(`/store/${encodeURIComponent(name)}`, { method: 'PUT', body: value }) }
  patchStore(name, value) { return this.request(`/store/${encodeURIComponent(name)}`, { method: 'PATCH', body: value }) }
  removeStore(name) { return this.request(`/store/${encodeURIComponent(name)}`, { method: 'DELETE' }) }

  onEvent(listener) { return this.events.subscribe(listener) }

  close() {
    this.eventSource?.close()
    this.socket?.close()
    this.eventSource = null
    this.eventReady = null
    this.socket = null
  }
}
