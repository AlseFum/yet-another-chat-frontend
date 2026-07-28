import { nanoid } from 'nanoid'
import { Subject } from 'rxjs'
import { launch } from '../llm/index.js'

class RemoteJob {
  constructor(snapshot) {
    this.events = new Subject()
    Object.assign(this, { status: 'idle', responseText: '', reasoning: '', attempts: [], error: null }, snapshot)
  }

  onEvent(listener) {
    listener({ jobId: this.id, type: 'state', state: this.status })
    return this.events.subscribe(listener)
  }

  apply(snapshot, event) {
    if (event?.type === 'delta' && ['completed', 'failed', 'cancelled'].includes(this.status)) return
    Object.assign(this, snapshot)
    if (event?.type === 'delta') {
      if (!snapshot?.responseText) this.responseText += event.content || ''
      if (!snapshot?.reasoning) this.reasoning += event.reasoning || ''
    }
    this.events.next(event || { jobId: this.id, type: 'state', state: this.status })
  }

  toJSON() {
    const { events, ...snapshot } = this
    return snapshot
  }
}

export class FrontendJobManager {
  constructor(client) {
    this.client = client
    this.jobs = new Map()
    this.events = new Subject()
    this.client?.onJobEvent(message => {
      if (message.type === 'transport.error') this.events.next({ source: 'transport', event: message })
      else this.applyServerEvent(message)
    })
  }

  add(job, source) {
    if (this.jobs.has(job.id)) throw new Error(`Job ${job.id} 已存在`)
    this.jobs.set(job.id, { job, source })
    job.onEvent(event => this.events.next({ job, source, event }))
    return job
  }

  get(jobId) { return this.jobs.get(jobId)?.job || null }
  list(ids = null) {
    const entries = ids ? ids.map(id => this.jobs.get(id)).filter(Boolean) : [...this.jobs.values()]
    return entries.map(({ job }) => job)
  }

  create(request, keyRef) {
    if (keyRef.type === 'temporary') return this.add(launch(request, keyRef.key), 'direct')
    if (keyRef.type !== 'server') throw new Error(`不支持的 KeyRef 类型 ${keyRef.type}`)
    return this.add(new RemoteJob({
      id: nanoid(),
      keyId: keyRef.keyId,
      request,
      status: 'idle',
      createdAt: new Date().toISOString(),
    }), 'server')
  }

  async startServer(jobId) {
    const entry = this.jobs.get(jobId)
    if (!entry || entry.source !== 'server') throw new Error(`找不到 server Job ${jobId}`)
    await this.client.launchJob({ jobId, keyId: entry.job.keyId, request: entry.job.request })
    if (entry.job.abortRequested) await this.client.abortJob(jobId)
    return entry.job
  }

  async load(ids) {
    if (!ids.length) return []
    const { jobs = [], missingIds = [] } = await this.client.loadJobs(ids)
    for (const snapshot of jobs) {
      const job = this.get(snapshot.id)
      if (job instanceof RemoteJob) job.apply(snapshot)
      else if (!job) this.add(new RemoteJob(snapshot), 'server')
    }
    for (const id of missingIds) if (!this.get(id)) this.add(new RemoteJob({ id, status: 'missing', error: 'Job 不存在' }), 'server')
    return this.list(ids)
  }

  applyServerEvent({ job, event }) {
    if (!job?.id) return null
    let target = this.get(job.id)
    if (!target) target = this.add(new RemoteJob(job), 'server')
    if (!(target instanceof RemoteJob)) throw new Error(`本地 Job ${job.id} 收到了 server 事件`)
    target.apply(job, event)
    return target
  }

  abort(jobId) {
    const entry = this.jobs.get(jobId)
    if (!entry) return false
    if (['completed', 'failed', 'cancelled', 'missing'].includes(entry.job.status)) return false
    if (entry.source === 'direct') {
      entry.job.abort()
      return true
    }
    entry.job.abortRequested = true
    void this.client.abortJob(jobId)
    return true
  }

  remove(jobId) {
    const entry = this.jobs.get(jobId)
    if (!entry) return false
    this.jobs.delete(jobId)
    return true
  }

  async clean(jobId) {
    const entry = this.jobs.get(jobId)
    if (!entry) return false
    if (!['completed', 'failed', 'cancelled', 'missing'].includes(entry.job.status)) throw new Error('Job 仍在运行，不能清理')
    if (entry.source === 'server' && entry.job.status !== 'missing') await this.client.cleanJob(jobId)
    return this.remove(jobId)
  }
}
