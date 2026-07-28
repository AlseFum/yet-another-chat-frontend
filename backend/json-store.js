import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Store } from './store.js'

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergePatch(target, patch) {
  if (!isObject(patch)) return copy(patch)
  const result = isObject(target) ? copy(target) : {}
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`不安全的字段名: ${key}`)
    if (value === null) delete result[key]
    else result[key] = mergePatch(result[key], value)
  }
  return result
}

export class JsonStore extends Store {
  constructor(directory = 'data') {
    super()
    this.directory = directory
    this.cache = new Map()
    mkdirSync(directory, { recursive: true })
  }

  path(workspace) { return join(this.directory, `${workspace}.json`) }

  workspace(workspace) {
    if (!this.cache.has(workspace)) {
      const path = this.path(workspace)
      this.cache.set(workspace, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {})
    }
    return this.cache.get(workspace)
  }

  persist(workspace) {
    const path = this.path(workspace)
    const temporary = `${path}.tmp`
    writeFileSync(temporary, JSON.stringify(this.workspace(workspace), null, 2))
    renameSync(temporary, path)
  }

  read(workspace, name) { return copy(this.workspace(workspace)[name]) }

  write(workspace, name, value) {
    this.workspace(workspace)[name] = copy(value)
    this.persist(workspace)
    return copy(value)
  }

  patch(workspace, name, value) {
    const patched = mergePatch(this.read(workspace, name), value)
    return this.write(workspace, name, patched)
  }

  remove(workspace, name) {
    const data = this.workspace(workspace)
    if (!Object.hasOwn(data, name)) return false
    delete data[name]
    this.persist(workspace)
    return true
  }

  list(workspace) { return Object.keys(this.workspace(workspace)) }
  readAll(workspace) { return copy(this.workspace(workspace)) }

  writeAll(workspace, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Store 必须是 JSON 对象')
    this.cache.set(workspace, copy(value))
    this.persist(workspace)
    return this.readAll(workspace)
  }
}
