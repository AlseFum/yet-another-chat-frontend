import { match, P } from '../../../../util/match.js'

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
  try { return typeof value === 'object' ? JSON.stringify(value) : String(value) } catch { return String(value) }
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
  return match(value, [
    [P.string, text => {
      const exact = text.match(TOKEN)
      if (!exact) return interpolateText(text, context)
      const resolved = resolveReference(context, exact[1])
      return resolved.found ? resolved.value : text
    }],
    [P.array, items => items.map(item => interpolateJSONValue(item, context))],
    [P.record, record => Object.fromEntries(Object.entries(record).map(([key, item]) => [key, interpolateJSONValue(item, context)]))],
    [P._, item => item],
  ])
}

export function interpolateJSON(template, context) {
  let value
  try { value = JSON.parse(template || '{}') } catch (error) { throw new Error(`工具参数不是有效 JSON：${error.message}`) }
  return interpolateJSONValue(value, context)
}

export function evaluateCondition(template, context) {
  const expression = String(template || '').replace(TOKENS, (raw, path) => {
    const resolved = resolveReference(context, path)
    if (!resolved.found) throw new Error(`条件引用不存在：${raw}`)
    return `ctx${path.split('.').map(key => `[${JSON.stringify(key)}]`).join('')}`
  })
  return Boolean(new Function('ctx', `"use strict"; return !!(${expression})`)(context))
}

export function referencedNodeIds(node) {
  const fields = node.type === 'prompt' ? [node.data?.prompt, node.data?.systemPrompt]
    : node.type === 'tool' ? [node.data?.args]
      : node.type === 'condition' ? [node.data?.condition]
        : node.type === 'text' ? [node.data?.text] : []
  const ids = new Set()
  for (const value of fields) {
    if (typeof value !== 'string') continue
    for (const match of value.matchAll(TOKENS)) {
      const [root, id] = match[1].split('.')
      if (root === 'node' && id) ids.add(id)
    }
  }
  return ids
}
