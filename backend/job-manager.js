import { Subject } from 'rxjs'
import { LLMJob } from '../llm/index.js'

const terminalStates = new Set(['completed', 'failed', 'cancelled'])

export class BackendJobManager {
  constructor({ getKey, saveJob = async () => {} } = {}) {
    if (typeof getKey !== 'function') throw new TypeError('BackendJobManager 需要 getKey')
    this.getKey = getKey
    this.saveJob = saveJob
    this.workspaces = new Map()
    this.events = new Subject()
  }

  jobs(workspace) {
    if (!this.workspaces.has(workspace)) this.workspaces.set(workspace, new Map())
    return this.workspaces.get(workspace)
  }

  get(workspace, jobId) { return this.jobs(workspace).get(jobId) || null }

  async launch({ workspace, jobId, keyId, request }) {
    if (!workspace) throw new TypeError('BackendJobManager 需要 workspace')
    if (!jobId) throw new TypeError('BackendJobManager 需要 jobId')
    if (this.jobs(workspace).has(jobId)) throw new Error(`Job ${jobId} 已存在`)
    const key = await this.getKey(workspace, keyId)
    if (!key) throw new Error(`找不到 Key ${keyId}`)

    const job = new LLMJob({ id: jobId, keyId, request, createdAt: new Date().toISOString() })
    this.jobs(workspace).set(jobId, job)
    job.events.subscribe(event => {
      const snapshot = job.toJSON()
      this.events.next({ workspace, job: snapshot, event })
      if (event.type === 'result' || (event.type === 'state' && terminalStates.has(event.state))) void this.saveJob(workspace, snapshot)
    })
    await this.saveJob(workspace, job.toJSON())
    job.result = Promise.resolve().then(() => job.execute(key, request))
    // The manager owns background execution. Terminal state and error details
    // are already published and persisted by the Job event subscription.
    job.result.catch(() => {})
    return job
  }

  abort(workspace, jobId) {
    const job = this.get(workspace, jobId)
    if (!job) return false
    job.abort()
    return true
  }

  remove(workspace, jobId) {
    const job = this.get(workspace, jobId)
    if (job && !terminalStates.has(job.status)) return false
    return this.jobs(workspace).delete(jobId) || !job
  }
}
