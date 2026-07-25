const PATH_PART = '[A-Za-z_$][\\w$]*|\\d+'
const PATH = `(?:${PATH_PART})(?:\\.(?:${PATH_PART}))*`
const TOKEN = new RegExp(`^\\{\\{\\s*(${PATH})\\s*\\}\\}$`)
const TOKENS = new RegExp(`\\{\\{\\s*(${PATH})\\s*\\}\\}`, 'g')

function hasOwn(value, key) {
  return value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)
}

function asText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

export function resolveReference(context, path) {
  let value = context
  for (const key of path.split('.')) {
    if (!hasOwn(value, key)) return { found: false, value: undefined }
    value = value[key]
  }
  return { found: true, value }
}

export function collectWorkflowVariables(nodes) {
  const variables = Object.create(null)
  for (const node of nodes) {
    if (node.type !== 'input') continue
    for (const variable of node.data?.variables || []) {
      const name = String(variable?.name || '').trim()
      if (name) variables[name] = variable.value ?? ''
    }
  }
  return variables
}

export function createInterpolationContext({ inputs = {}, nodes = [], results = {} } = {}) {
  const node = Object.create(null)
  for (const [id, result] of Object.entries(results)) node[id] = result?.output
  return { ...inputs, var: collectWorkflowVariables(nodes), node }
}

export function interpolateText(template, context) {
  return String(template || '').replace(TOKENS, (raw, path) => {
    const resolved = resolveReference(context, path)
    return resolved.found ? asText(resolved.value) : raw
  })
}

function interpolateJSONValue(value, context) {
  if (typeof value === 'string') {
    const exact = value.match(TOKEN)
    if (exact) {
      const resolved = resolveReference(context, exact[1])
      return resolved.found ? resolved.value : value
    }
    return interpolateText(value, context)
  }
  if (Array.isArray(value)) return value.map(item => interpolateJSONValue(item, context))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateJSONValue(item, context)]))
  return value
}

export function interpolateJSON(template, context) {
  try { return interpolateJSONValue(JSON.parse(template || '{}'), context) } catch { return {} }
}

export function evaluateCondition(template, context) {
  const expression = String(template || '').replace(TOKENS, (raw, path) => {
    const resolved = resolveReference(context, path)
    if (!resolved.found) return raw
    return `ctx${path.split('.').map(key => `[${JSON.stringify(key)}]`).join('')}`
  })
  return Boolean(new Function('ctx', `"use strict"; return !!(${expression})`)(context))
}

function templateFields(node) {
  if (node.type === 'prompt') return [node.data?.prompt, node.data?.sysPrompt]
  if (node.type === 'tool') return [node.data?.args]
  if (node.type === 'condition') return [node.data?.condition]
  if (node.type === 'text') return [node.data?.text]
  return []
}

export function referencedNodeIds(node) {
  const ids = new Set()
  for (const value of templateFields(node)) {
    if (typeof value !== 'string') continue
    for (const match of value.matchAll(TOKENS)) {
      const [root, id] = match[1].split('.')
      if (root === 'node' && id) ids.add(id)
    }
  }
  return ids
}
