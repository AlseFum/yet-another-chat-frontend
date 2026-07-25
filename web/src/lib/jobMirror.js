import { ApiConfig, createLLMFetch, JobRequest, LLMJob } from '../../../llm/index.js'
import { getWorkspace } from './api.js'

function id() { return `mirror-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` }

export class JobMirror {
  constructor(snapshot = {}) {
    Object.assign(this, { id: snapshot.id || id(), status: 'queued', responseText: '', error: null, listeners: new Set(), ...snapshot })
    this.result = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject })
    // Restored history can already be cancelled/failed before any caller has a
    // reference to its result. Mark that rejection handled without changing
    // the promise returned to callers that do await it.
    this.result.catch(() => {})
  }

  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  emit(event) { for (const listener of this.listeners) listener(event, this) }
  apply(snapshot, event) {
    Object.assign(this, snapshot || {})
    if (event?.type === 'delta') this.responseText += event.content || ''
    this.emit(event || { type: 'snapshot' })
    if (event?.type === 'result') this.resolve(event.value ?? this.value ?? this.responseText)
    if (['failed', 'cancelled'].includes(this.status)) this.reject(new Error(this.error || 'LLM 任务未完成'))
  }
}

export async function createLocalJobMirror(apiConfigInput, requestInput, registry, { signal, onChunk } = {}) {
  const apiConfig = apiConfigInput instanceof ApiConfig ? apiConfigInput : ApiConfig.fromDirect(apiConfigInput)
  const request = JobRequest.from(requestInput)
  apiConfig.assertModel(request.model)
  const job = new LLMJob({ id: id(), request: request.toJSON(), createdAt: new Date().toISOString() })
  const mirror = new JobMirror({ id: job.id, mode: 'direct', status: job.status, request: job.request })
  const controller = new AbortController()
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  mirror.cancel = () => controller.abort()
  registry.add(mirror)
  job.subscribe(event => mirror.apply(job.toJSON(), event))
  const transport = createLLMFetch({ resolveKey: async () => ({ apiKey: apiConfig.keyBody }) })
  void job.execute(transport, apiConfig, request, { signal: controller.signal, onChunk }).then(result => {
    mirror.value = result.value
    mirror.apply(job.toJSON(), { type: 'result', value: result.value })
  }).catch(error => mirror.apply({ ...job.toJSON(), error: error.message }, { type: 'error', error: error.message }))
  return mirror
}

export async function createRemoteJobMirror(apiConfig, request, registry, { source } = {}) {
  const res = await fetch(`/api/${getWorkspace()}/llm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialId: apiConfig.keyId, request: request.toJSON(), source }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '无法创建 LLM 任务')
  const mirror = registry.get(data.job.id) || registry.add(new JobMirror({ ...data.job, mode: 'proxy' }))
  mirror.apply({ ...data.job, mode: 'proxy' })
  return mirror
}

export function createJobMirrorRegistry(workspace) {
  const mirrors = new Map()
  return {
    add(mirror) { mirrors.set(mirror.id, mirror); workspace.llmJobs = [...mirrors.values()].slice(-200); return mirror },
    get: id => mirrors.get(id),
    list: () => [...mirrors.values()],
    applyServer({ job, event }) {
      if (!job?.id) return
      const mirror = mirrors.get(job.id) || this.add(new JobMirror({ ...job, mode: 'proxy' }))
      mirror.apply(job, event)
      return mirror
    },
    restore(jobs) { for (const job of jobs || []) this.applyServer({ job }) },
  }
}
