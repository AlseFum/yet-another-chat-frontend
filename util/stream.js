export function createStream(subscribe) {
  const chain = transform => createStream(observer => subscribe(transform(observer)))
  return {
    subscribe(next, error = () => {}) { return subscribe({ next, error }) || (() => {}) },
    map(fn) { return chain(observer => ({ next: value => { try { observer.next(fn(value)) } catch (error) { observer.error(error) } }, error: observer.error })) },
    filter(fn) { return chain(observer => ({ next: value => { try { if (fn(value)) observer.next(value) } catch (error) { observer.error(error) } }, error: observer.error })) },
    tap(fn) { return chain(observer => ({ next: value => { try { fn(value); observer.next(value) } catch (error) { observer.error(error) } }, error: observer.error })) },
    debounce(ms) {
      return createStream(observer => {
        let timer = null
        const unsubscribe = subscribe({ next: value => { clearTimeout(timer); timer = setTimeout(() => observer.next(value), ms) }, error: observer.error })
        return () => { clearTimeout(timer); unsubscribe?.() }
      })
    },
    distinct(key = value => value) {
      return createStream(observer => {
        let previous = Symbol('initial')
        return subscribe({ next: value => { const current = key(value); if (current !== previous) { previous = current; observer.next(value) } }, error: observer.error })
      })
    },
    switchMap(fn) {
      return createStream(observer => {
        let cancel = null
        const unsubscribe = subscribe({ next: value => { cancel?.(); const inner = fn(value); cancel = inner.subscribe(observer.next, observer.error) }, error: observer.error })
        return () => { cancel?.(); unsubscribe?.() }
      })
    },
  }
}

export function fromEvent(target, type, options) {
  return createStream(observer => {
    const handler = event => observer.next(event)
    target.addEventListener(type, handler, options)
    return () => target.removeEventListener(type, handler, options)
  })
}

export function fromAsyncIterable(iterable) {
  return createStream(observer => {
    let cancelled = false
    ;(async () => {
      try { for await (const value of iterable) { if (cancelled) break; observer.next(value) } } catch (error) { if (!cancelled) observer.error(error) }
    })()
    return () => { cancelled = true }
  })
}
