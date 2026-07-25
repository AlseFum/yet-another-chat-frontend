export function wait(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(cleanup, Math.max(0, ms), resolve)
    function cleanup() { signal?.removeEventListener('abort', abort); resolve() }
    function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal.reason || new DOMException('Aborted', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

export async function withTimeout(task, ms, { signal } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  try {
    return await Promise.race([
      typeof task === 'function' ? task(controller.signal) : task,
      wait(ms, { signal: controller.signal }).then(() => { throw new Error(`Timed out after ${ms}ms`) }),
    ])
  } finally { controller.abort(); signal?.removeEventListener('abort', abort) }
}

export function createMutex() {
  let tail = Promise.resolve()
  return async fn => {
    const previous = tail
    const done = deferred()
    tail = done.promise.catch(() => {})
    await previous
    try { return await fn() } finally { done.resolve() }
  }
}

export function createQueue({ concurrency = 1 } = {}) {
  const pending = []
  let active = 0
  function drain() {
    while (active < concurrency && pending.length) {
      const { fn, result } = pending.shift()
      active++
      Promise.resolve().then(fn).then(result.resolve, result.reject).finally(() => { active--; drain() })
    }
  }
  return {
    add(fn) { const result = deferred(); pending.push({ fn, result }); drain(); return result.promise },
    get size() { return pending.length },
    get active() { return active },
  }
}
