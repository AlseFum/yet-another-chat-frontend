import WebSocket from 'ws'
import { Subject } from 'rxjs'

export class HttpSseWsTransport {
  constructor(baseUrl = 'http://localhost:1146', workspace = 'default') {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.workspace = workspace
    this.workspaceUrl = `${this.baseUrl}/${encodeURIComponent(workspace)}`
    this.events = new Subject()
    this.socket = null
    this.sseController = null
  }

  async connect() {
    this.sseController = new AbortController()
    const response = await fetch(`${this.workspaceUrl}/event`, { signal: this.sseController.signal })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `SSE ${response.status}`)
    }
    void this.readSse(response)
    const wsUrl = this.workspaceUrl.replace(/^http/, 'ws') + '/ws'
    this.socket = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve)
      this.socket.once('error', reject)
    })
  }

  async readSse(response) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''
        for (const block of blocks) {
          const data = block.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim()
          if (data) this.events.next(JSON.parse(data))
        }
      }
    } catch (error) {
      if (!this.sseController.signal.aborted) {
        this.events.next({ type: 'transport.error', error: error.message })
      }
    }
  }

  async loadJobs(ids) {
    const query = new URLSearchParams()
    for (const id of ids) query.append('id', id)
    const response = await fetch(`${this.workspaceUrl}/job?${query}`)
    if (!response.ok) throw new Error(`读取 Job 失败: ${response.status}`)
    return response.json()
  }

  async launchJob(input) {
    const response = await fetch(`${this.workspaceUrl}/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `创建 Job 失败: ${response.status}`)
    return body
  }

  async abortJob(jobId) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'job.abort', jobId }))
      return true
    }
    const response = await fetch(`${this.workspaceUrl}/job/${encodeURIComponent(jobId)}/abort`, { method: 'POST' })
    return response.ok
  }

  async cleanJob(jobId) {
    const response = await fetch(`${this.workspaceUrl}/job/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `清理 Job 失败: ${response.status}`)
    return body.removed === true
  }

  async loadState() {
    const response = await fetch(`${this.workspaceUrl}/state`)
    if (!response.ok) throw new Error(`读取 Application State 失败: ${response.status}`)
    return response.json()
  }

  async saveState(state) {
    const response = await fetch(`${this.workspaceUrl}/state`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state),
    })
    if (!response.ok) throw new Error(`保存 Application State 失败: ${response.status}`)
    return response.json()
  }

  async listKeys() {
    const response = await fetch(`${this.workspaceUrl}/key`)
    if (!response.ok) throw new Error(`读取 Key 失败: ${response.status}`)
    return response.json()
  }

  async saveKey(key) {
    const response = await fetch(`${this.workspaceUrl}/key`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(key),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `保存 Key 失败: ${response.status}`)
    return body
  }

  async deleteKey(keyId) {
    const response = await fetch(`${this.workspaceUrl}/key/${encodeURIComponent(keyId)}`, { method: 'DELETE' })
    return response.ok
  }

  async listStore() {
    const response = await fetch(`${this.workspaceUrl}/store`)
    if (!response.ok) throw new Error(`读取 Store 列表失败: ${response.status}`)
    return Object.keys(await response.json())
  }

  async readAllStore() {
    const response = await fetch(`${this.workspaceUrl}/store`)
    if (!response.ok) throw new Error(`读取 Store 失败: ${response.status}`)
    return response.json()
  }

  async writeAllStore(value) {
    const response = await fetch(`${this.workspaceUrl}/store`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `覆盖 Store 失败: ${response.status}`)
    return body
  }

  async readStore(name) {
    const response = await fetch(`${this.workspaceUrl}/store/${encodeURIComponent(name)}`)
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `读取 Store 失败: ${response.status}`)
    return body
  }

  async writeStore(name, value) {
    const response = await fetch(`${this.workspaceUrl}/store/${encodeURIComponent(name)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `修改 Store 失败: ${response.status}`)
    return body
  }

  async patchStore(name, value) {
    const response = await fetch(`${this.workspaceUrl}/store/${encodeURIComponent(name)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/merge-patch+json' }, body: JSON.stringify(value),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `Patch Store 失败: ${response.status}`)
    return body
  }

  async removeStore(name) {
    const response = await fetch(`${this.workspaceUrl}/store/${encodeURIComponent(name)}`, { method: 'DELETE' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `删除 Store 失败: ${response.status}`)
    return body.removed
  }

  onJobEvent(listener) { return this.events.subscribe(listener) }

  close() {
    this.sseController?.abort()
    this.socket?.close()
  }
}
