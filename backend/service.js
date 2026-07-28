import { JobRequest } from '../llm/index.js'

export function readRecord(store, workspace, name) {
  const value = store.read(workspace, name)
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Store ${name} 必须是以 ID 为键的对象`)
  return value
}

function assertPublicStoreName(name) {
  if (!['key', 'keys'].includes(name)) return
  const error = new Error('Store API 不允许操作 keys')
  error.statusCode = 403
  throw error
}

export class BackendService {
  constructor({ jobs, store } = {}) {
    if (!jobs) throw new TypeError('BackendService 需要 jobs')
    if (!store) throw new TypeError('BackendService 需要 store')
    this.jobs = jobs
    this.store = store
  }

  async launchJob(workspace, input) {
    const request = input.request instanceof JobRequest ? input.request : new JobRequest(input.request)
    const job = await this.jobs.launch({ ...input, workspace, request })
    return job.toJSON()
  }

  async getJobs(workspace, ids) {
    const stored = readRecord(this.store, workspace, 'jobs')
    const jobs = ids.map(id => this.jobs.get(workspace, id)?.toJSON() || stored[id]).filter(Boolean)
    return { jobs, missingIds: ids.filter(id => !jobs.some(job => job.id === id)) }
  }

  abortJob(workspace, jobId) {
    return this.jobs.abort(workspace, jobId)
  }

  cleanJob(workspace, jobId) {
    if (!this.jobs.remove(workspace, jobId)) return false
    const stored = readRecord(this.store, workspace, 'jobs')
    if (!(jobId in stored)) return true
    delete stored[jobId]
    this.store.write(workspace, 'jobs', stored)
    return true
  }

  onJobEvent(listener) {
    return this.jobs.events.subscribe(listener)
  }

  getState(workspace) { return this.store.read(workspace, 'state') ?? null }
  setState(workspace, state) { return this.store.write(workspace, 'state', state) }

  listKeys(workspace) {
    return Object.values(readRecord(this.store, workspace, 'keys')).map(({ apiKey, ...key }) => key)
  }

  setKey(workspace, key) {
    const keys = readRecord(this.store, workspace, 'keys')
    keys[key.id] = key
    this.store.write(workspace, 'keys', keys)
    return key
  }

  deleteKey(workspace, keyId) {
    const keys = readRecord(this.store, workspace, 'keys')
    if (!(keyId in keys)) return false
    delete keys[keyId]
    this.store.write(workspace, 'keys', keys)
    return true
  }

  readStore(workspace, name) { assertPublicStoreName(name); return this.store.read(workspace, name) }
  writeStore(workspace, name, value) { assertPublicStoreName(name); return this.store.write(workspace, name, value) }
  patchStore(workspace, name, value) { assertPublicStoreName(name); return this.store.patch(workspace, name, value) }
  removeStore(workspace, name) { assertPublicStoreName(name); return this.store.remove(workspace, name) }
  listStore(workspace) { return this.store.list(workspace).filter(name => !['key', 'keys'].includes(name)) }

  readAllStore(workspace) {
    const { key, keys, ...data } = this.store.readAll(workspace)
    return data
  }

  writeAllStore(workspace, value) {
    if (Object.hasOwn(value, 'key') || Object.hasOwn(value, 'keys')) {
      const error = new Error('Store API 不允许操作 keys')
      error.statusCode = 403
      throw error
    }
    const keys = this.store.read(workspace, 'keys')
    const data = keys === undefined ? value : { ...value, keys }
    this.store.writeAll(workspace, data)
    return this.readAllStore(workspace)
  }
}
