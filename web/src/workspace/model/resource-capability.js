import { err, ok, tryResult } from '../../../../util/result.js'

const resourceTypes = new Set(['text', 'preset', 'tool', 'persona'])
const copy = value => JSON.parse(JSON.stringify(value))

function resourceError(code, message, details = {}) {
  const error = new Error(message)
  error.name = 'ResourceError'
  error.code = code
  Object.assign(error, details)
  return error
}

export class ResourceCapability {
  constructor(application) {
    this.application = application
    this.leases = new Map()
    this.waiters = new Map()
    this.closed = false
  }

  list(type) {
    if (!resourceTypes.has(type)) return []
    return this.application.list(type)
  }

  get(type, resourceId) {
    if (!resourceTypes.has(type)) return null
    return this.application.get(type, resourceId)
  }

  borrow(type, resourceId) {
    return this.#acquire(type, resourceId, false)
  }

  borrowMut(type, resourceId) {
    return this.#acquire(type, resourceId, true)
  }

  borrowUntil(type, resourceId, timeoutMs) {
    return this.#acquireUntil(type, resourceId, false, timeoutMs)
  }

  borrowMutUntil(type, resourceId, timeoutMs) {
    return this.#acquireUntil(type, resourceId, true, timeoutMs)
  }

  close() {
    this.closed = true
    this.leases.clear()
    for (const waiters of this.waiters.values()) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiter.resolve(err(resourceError('CLOSED', 'Resource capability 已关闭')))
      }
    }
    this.waiters.clear()
  }

  #acquireUntil(type, resourceId, mutable, timeoutMs) {
    const timeout = Number(timeoutMs)
    if (!Number.isFinite(timeout) || timeout < 0) {
      return Promise.resolve(err(resourceError('INVALID_TIMEOUT', `无效的借用等待时间 ${timeoutMs}`, { timeoutMs })))
    }

    const immediate = this.#acquire(type, resourceId, mutable)
    if (immediate.ok || immediate.error.code !== 'BORROW_CONFLICT') return Promise.resolve(immediate)
    if (timeout === 0) return Promise.resolve(err(this.#timeoutError(type, resourceId, mutable, timeout)))

    const key = `${type}:${resourceId}`
    return new Promise(resolve => {
      const waiters = this.waiters.get(key) || new Set()
      const waiter = {
        mutable,
        resolve,
        timer: setTimeout(() => {
          waiters.delete(waiter)
          if (!waiters.size) this.waiters.delete(key)
          resolve(err(this.#timeoutError(type, resourceId, mutable, timeout)))
        }, timeout),
        tryAcquire: () => {
          if (this.closed) return
          const result = this.#acquire(type, resourceId, mutable)
          if (!result.ok && result.error.code === 'BORROW_CONFLICT') return
          clearTimeout(waiter.timer)
          waiters.delete(waiter)
          if (!waiters.size) this.waiters.delete(key)
          resolve(result)
        },
      }
      waiters.add(waiter)
      this.waiters.set(key, waiters)
    })
  }

  #timeoutError(type, resourceId, mutable, timeoutMs) {
    return resourceError('TIMEOUT', `等待 Resource ${type}:${resourceId} 借用超时`, { type, resourceId, mutable, timeoutMs })
  }

  #wake(key) {
    for (const waiter of [...(this.waiters.get(key) || [])]) waiter.tryAcquire()
  }

  #acquire(type, resourceId, mutable) {
    if (this.closed) return err(resourceError('CLOSED', 'Resource capability 已关闭'))
    if (!resourceTypes.has(type)) return err(resourceError('INVALID_TYPE', `不支持的 Resource 类型 ${type}`, { type }))
    if (!this.application.has(type, resourceId)) return err(resourceError('NOT_FOUND', `找不到 Resource ${type}:${resourceId}`, { type, resourceId }))

    const key = `${type}:${resourceId}`
    const state = this.leases.get(key) || { readers: new Set(), writer: null }
    if (mutable && (state.writer || state.readers.size)) return err(resourceError('BORROW_CONFLICT', `Resource ${key} 已被借用`, { type, resourceId, mutable }))
    if (!mutable && state.writer) return err(resourceError('BORROW_CONFLICT', `Resource ${key} 正在被独占修改`, { type, resourceId, mutable }))

    const token = Symbol(key)
    if (mutable) state.writer = token
    else state.readers.add(token)
    this.leases.set(key, state)

    let released = false
    const active = () => {
      if (this.closed) throw resourceError('CLOSED', 'Resource capability 已关闭', { type, resourceId, mutable })
      if (released) throw resourceError('LEASE_RELEASED', `Resource lease ${key} 已释放`, { type, resourceId, mutable })
    }
    const read = () => {
      active()
      const resource = this.application.get(type, resourceId)
      if (!resource) throw resourceError('NOT_FOUND', `Resource ${key} 已不存在`, { type, resourceId })
      return resource
    }
    const release = () => {
      if (released) return
      released = true
      if (mutable && state.writer === token) state.writer = null
      else state.readers.delete(token)
      if (!state.writer && !state.readers.size) this.leases.delete(key)
      this.#wake(key)
    }

    const lease = {
      key,
      mutable,
      get released() { return released },
      read,
      release,
    }
    if (mutable) {
      lease.update = patch => tryResult(async () => {
        active()
        const updated = await this.application.update(type, resourceId, patch)
        return copy(updated)
      })
      lease.replace = value => tryResult(async () => {
        active()
        const updated = await this.application.replace(type, resourceId, value)
        return copy(updated)
      })
    }
    return ok(lease)
  }
}
