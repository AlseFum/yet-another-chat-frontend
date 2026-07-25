import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { createMutex } from '../../util/index.js'

const writeLock = createMutex()

export function createJsonStore(root) {
  const pathFor = (workspace, resource) => join(root, workspace, `${resource}.json`)
  const cache = new Map()
  const keyFor = (workspace, resource) => `${workspace}:${resource}`

  function entryFor(workspace, resource) {
    const key = keyFor(workspace, resource)
    let entry = cache.get(key)
    if (entry) return entry
    const path = pathFor(workspace, resource)
    let value = []
    if (existsSync(path)) {
      try { value = JSON.parse(readFileSync(path, 'utf8')) } catch {}
    }
    entry = { workspace, resource, value, dirty: false, version: 0, timer: null }
    cache.set(key, entry)
    return entry
  }

  async function flushEntry(entry) {
    if (!entry.dirty) return
    clearTimeout(entry.timer)
    entry.timer = null
    const version = entry.version
    const value = entry.value
    await writeLock(async () => {
      const path = pathFor(entry.workspace, entry.resource)
      mkdirSync(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8')
      renameSync(temporary, path)
    })
    if (entry.version === version) entry.dirty = false
    else schedule(entry)
  }

  function schedule(entry) {
    if (entry.timer || !entry.dirty) return
    entry.timer = setTimeout(() => {
      void flushEntry(entry).catch(error => console.error(`无法保存 ${entry.resource}: ${error.message}`))
    }, 500)
  }

  return {
    read(workspace, resource) {
      return entryFor(workspace, resource).value
    },
    write(workspace, resource, value, { immediate = false } = {}) {
      const entry = entryFor(workspace, resource)
      entry.value = value
      entry.dirty = true
      entry.version++
      if (immediate) return flushEntry(entry)
      schedule(entry)
      return Promise.resolve()
    },
    flush(workspace, resource) { return flushEntry(entryFor(workspace, resource)) },
    flushAll() { return Promise.all([...cache.values()].map(flushEntry)) },
  }
}
