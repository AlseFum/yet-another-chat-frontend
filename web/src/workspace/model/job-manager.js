import { nanoid } from 'nanoid'
import { Subject } from 'rxjs'
import { JobRequest, launch } from '../../../../llm/index.js'
import { KeyRef } from './key-ref.js'

const terminalStates = new Set(['completed', 'failed', 'cancelled', 'missing'])

export class BrowserRemoteJob {
  constructor(snapshot) {
    this.events = new Subject()
    Object.assign(this, { status: 'idle', responseText: '', reasoning: '', attempts: [], error: null }, snapshot)
  }

  apply(snapshot, event = null) {
    if (snapshot) Object.assign(this, snapshot)
    if (event?.type === 'delta' && !snapshot?.responseText) this.responseText += event.content || ''
    if (event?.type === 'delta' && !snapshot?.reasoning) this.reasoning += event.reasoning || ''
    this.events.next(event || { jobId: this.id, type: 'state', state: this.status })
  }

  onEvent(listener) { return this.events.subscribe(listener) }

  toJSON() {
    const { events, ...snapshot } = this
    return snapshot
  }
}

export class BrowserJobManager {
  constructor(transport) {
    this.transport = transport
    this.jobs = new Map()
    this.sources = new Map()
    this.metadata = new Map()
    this.jobSubscriptions = new Map()
    this.events = new Subject()
    this.subscription = transport.onEvent(message => {
      if (message.type === 'transport.error') return this.events.next({ source: 'transport', event: message })
      this.applyServerEvent(message)
    })
  }

  get(jobId) { return this.jobs.get(jobId) || null }
  list(ids = null) { return (ids || [...this.jobs.keys()]).map(id => this.get(id)).filter(Boolean) }
  source(jobId) { return this.sources.get(jobId) || 'server' }
  snapshot(job) { return { ...job.toJSON(), mode: this.source(job.id), metadata: this.metadata.get(job.id) || {} } }
  snapshots(ids = null) { return this.list(ids).map(job => this.snapshot(job)) }

  create({ request, keyRef, metadata = {} }) {
    if (!(keyRef instanceof KeyRef)) throw new TypeError('Job 需要 KeyRef')
    const normalizedRequest = request instanceof JobRequest ? request : new JobRequest(request)
    if (keyRef.type === 'temporary') {
      const job = launch(normalizedRequest, keyRef.key)
      this.jobs.set(job.id, job)
      this.sources.set(job.id, 'direct')
      this.metadata.set(job.id, metadata)
      this.jobSubscriptions.set(job.id, job.onEvent(event => this.events.next({ source: 'direct', job, event })))
      job.result.catch(() => {})
      return job
    }
    const job = new BrowserRemoteJob({ id: nanoid(), keyId: keyRef.keyId, request: normalizedRequest, status: 'idle', createdAt: new Date().toISOString() })
    this.jobs.set(job.id, job)
    this.sources.set(job.id, 'server')
    this.metadata.set(job.id, metadata)
    this.events.next({ source: 'local', job, event: { jobId: job.id, type: 'state', state: 'idle' } })
    return job
  }

  async start(jobId) {
    const job = this.get(jobId)
    if (!job) throw new Error(`找不到 Job ${jobId}`)
    if (this.source(jobId) === 'direct') return job
    const snapshot = await this.transport.launchJob({ jobId: job.id, keyId: job.keyId, request: job.request })
    job.apply(snapshot)
    return job
  }

  async load(ids, options = {}) {
    if (!ids.length) return []
    const { jobs = [], missingIds = [] } = await this.transport.loadJobs(ids, options)
    for (const snapshot of jobs) {
      const job = this.get(snapshot.id) || new BrowserRemoteJob(snapshot)
      this.jobs.set(job.id, job)
      this.sources.set(job.id, 'server')
      job.apply(snapshot)
    }
    for (const id of missingIds) {
      if (this.get(id)) continue
      this.jobs.set(id, new BrowserRemoteJob({ id, status: 'missing', error: 'Job 不存在' }))
      this.sources.set(id, 'server')
    }
    return this.list(ids)
  }

  async loadDetail(jobId) {
    const { jobs = [] } = await this.transport.loadJobs([jobId], { detail: true })
    const snapshot = jobs[0]
    if (!snapshot) return null
    const job = this.get(jobId) || new BrowserRemoteJob(snapshot)
    this.jobs.set(job.id, job)
    this.sources.set(job.id, 'server')
    job.apply(snapshot)
    this.events.next({ source: 'server', job, event: { jobId, type: 'detail' } })
    return job
  }

  applyServerEvent({ job, event }) {
    if (!job?.id) return null
    const target = this.get(job.id) || new BrowserRemoteJob(job)
    this.jobs.set(target.id, target)
    this.sources.set(target.id, 'server')
    target.apply(job, event)
    this.events.next({ source: 'server', job: target, event })
    return target
  }

  async abort(jobId) {
    const job = this.get(jobId)
    if (!job || terminalStates.has(job.status)) return false
    if (this.source(jobId) === 'direct') {
      job.abort()
      return true
    }
    await this.transport.abortJob(jobId)
    return true
  }

  async clean(jobId) {
    const job = this.get(jobId)
    if (!job) return false
    if (!terminalStates.has(job.status)) throw new Error('Job 仍在运行，不能清理')
    if (this.source(jobId) === 'server' && job.status !== 'missing') await this.transport.cleanJob(jobId)
    this.jobSubscriptions.get(jobId)?.unsubscribe()
    this.jobSubscriptions.delete(jobId)
    this.jobs.delete(jobId)
    this.sources.delete(jobId)
    this.metadata.delete(jobId)
    this.events.next({ source: 'local', job, event: { jobId, type: 'cleaned' } })
    return true
  }

  close() {
    this.subscription.unsubscribe()
    for (const subscription of this.jobSubscriptions.values()) subscription.unsubscribe()
    this.jobSubscriptions.clear()
    this.events.complete()
  }
}
