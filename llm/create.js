import { LLMJob } from './job.js'
import { ApiConfig } from './api-config.js'
import { JobRequest } from './job-request.js'
import { jobSummary } from './job-summary.js'

/**
 * Server-side LLM job manager. It owns active jobs, persists serializable job
 * snapshots, and broadcasts lifecycle events. Provider I/O is injected so the
 * manager remains independent of storage and credential implementations.
 */
const MAX_JOBS = 200

// --- Snapshot helpers ---

function copy(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

function jobId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function createLLMJobManager(store, fetch) {
  if (typeof fetch !== 'function') throw new TypeError('createLLMJobManager 需要 fetch 函数')
  const active = new Map()
  const controllers = new Map()
  const listeners = new Set()

  // --- Publication and persistence ---

  function publish(job, event) {
    // Delta events only need identity and state; snapshots are used for initial
    // sync and terminal persistence updates.
    const snapshot = jobSummary(job)
    for (const listener of listeners) listener({ workspace: job.workspace, job: snapshot, event })
  }

  async function save(workspace, job) {
    const jobs = store.read(workspace, 'llm-jobs').filter(item => item.id !== job.id)
    jobs.unshift(copy(job))
    await store.write(workspace, 'llm-jobs', jobs.slice(0, MAX_JOBS), { immediate: ['completed', 'failed', 'cancelled'].includes(job.status) })
  }

  // --- Job submission ---

  // The server owns proxy jobs and broadcasts lifecycle events while callers
  // receive the live handle immediately.
  async function submit({ workspace, credentialId, request, source = 'http', context = null, signal } = {}) {
    const credential = store.read(workspace, 'api-keys').find(item => item.id === credentialId)
    if (!credential) {
      const error = new Error('请选择有效的 API Key')
      error.statusCode = 400
      throw error
    }
    const apiConfig = ApiConfig.fromCredential(credential, workspace)
    const jobRequest = JobRequest.from(request)
    apiConfig.assertModel(jobRequest.model)
    const job = new LLMJob({ id: jobId(), workspace, credentialId, source, context, request: jobRequest.toJSON(), createdAt: new Date().toISOString() })
    job.subscribe(event => publish(job, event))
    const controller = new AbortController()
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
    active.set(job.id, job)
    controllers.set(job.id, controller)
    await save(workspace, job)
    publish(job, { type: 'snapshot' })
    const result = job.execute(fetch, apiConfig, jobRequest, { signal: controller.signal }).finally(async () => {
      active.delete(job.id)
      controllers.delete(job.id)
      await save(workspace, job)
      publish(job, { type: 'snapshot' })
    })
    return { job, result, stop: () => controller.abort() }
  }

  // --- Public manager API ---

  return {
    submit,
    get: id => active.get(id) || null,
    stop: id => controllers.get(id)?.abort(),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}
