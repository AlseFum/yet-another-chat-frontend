/**
 * Provider-neutral request plus executable validation and retry policies.
 * Policies run as functions, but serialize to descriptors so proxy jobs can
 * reconstruct the same behavior on the server.
 */

// --- JSON and schema validation ---

function extractJSON(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('LLM 未返回 JSON 对象')
  try { return JSON.parse(cleaned.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1')) } catch (error) { throw new Error(`无法解析 LLM JSON: ${error.message}`) }
}

function validateSchema(value, schema, path = '$') {
  if (!schema) return []
  const errors = []
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  const acceptedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (acceptedTypes.length && !acceptedTypes.includes(type)) errors.push(`${path} 应为 ${acceptedTypes.join(' 或 ')}，实际为 ${type}`)
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} 必须是 ${schema.enum.map(item => JSON.stringify(item)).join('、')} 之一`)
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} 至少需要 ${schema.minLength} 个字符`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} 不能超过 ${schema.maxLength} 个字符`)
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) errors.push(`${path} 必须是 ISO 8601 时间`)
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} 不能小于 ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} 不能大于 ${schema.maximum}`)
  }
  if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key} 为必填字段`)
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) errors.push(...validateSchema(value[key], child, `${path}.${key}`))
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) errors.push(`${path}.${key} 不允许额外字段`)
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} 至少需要 ${schema.minItems} 项`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} 最多只能有 ${schema.maxItems} 项`)
    if (schema.items) value.forEach((item, index) => errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)))
  }
  return errors
}

// --- Validator factories ---

export function createSchemaValidator(schema) {
  const validator = text => {
    try {
      const value = extractJSON(text)
      const errors = validateSchema(value, schema)
      return errors.length ? { ok: false, errors } : { ok: true, value }
    } catch (error) { return { ok: false, errors: [error.message] } }
  }
  validator.toJSON = () => ({ type: 'schema', schema })
  return validator
}

export function createJSONValidator() {
  const validator = text => {
    try { return { ok: true, value: extractJSON(text) } } catch (error) { return { ok: false, errors: [error.message] } }
  }
  validator.toJSON = () => ({ type: 'json' })
  return validator
}

// --- Retry policy factories ---

export function createRepairRetrier(maxRetries = 2) {
  const retrier = ({ messages, output, errors, attempt }) => {
    if (attempt > maxRetries) return null
    const excerpt = String(output || '').slice(0, 12000)
    return [...messages, {
      role: 'user',
      content: `上一次输出不符合要求。\n校验错误：\n${errors.map(error => `- ${error}`).join('\n')}\n\n原始输出：\n${excerpt}\n\n请只返回符合要求的 JSON 对象，不要输出 Markdown、解释或额外字段。`,
    }]
  }
  retrier.toJSON = () => ({ type: 'repair', maxRetries })
  return retrier
}

// --- Policy serialization ---

function hydrateValidator(value) {
  if (!value || typeof value === 'function') return value || null
  if (value.type === 'schema' && value.schema) return createSchemaValidator(value.schema)
  if (value.type === 'json') return createJSONValidator()
  throw new TypeError('无法还原 JobRequest validator')
}

function hydrateRetrier(value) {
  if (!value || typeof value === 'function') return value || null
  if (value.type === 'repair') return createRepairRetrier(value.maxRetries)
  throw new TypeError('无法还原 JobRequest retrier')
}

function serializeFunction(fn, name) {
  if (!fn) return null
  if (typeof fn.toJSON !== 'function') throw new TypeError(`${name} 必须提供 toJSON() 才能用于 JobRequest`)
  return fn.toJSON()
}

// --- Request model ---

export class JobRequest {
  constructor({ messages = [], model, maxTokens = 4096, temperature = 0.7, strictSchema = null, validator = null, retrier = null, stream = true } = {}) {
    this.messages = Array.isArray(messages) ? messages : []
    this.model = model
    this.maxTokens = Number(maxTokens) || 4096
    this.temperature = Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7
    this.strictSchema = strictSchema && typeof strictSchema === 'object' ? strictSchema : null
    this.validator = hydrateValidator(validator)
    this.retrier = hydrateRetrier(retrier)
    this.stream = stream !== false
  }

  validate(text) {
    return this.validator ? this.validator(text) : { ok: true, value: text }
  }

  retry(context) {
    const messages = this.retrier?.({ messages: this.messages, ...context })
    if (!messages) return false
    this.messages = messages
    return true
  }

  toJSON() {
    return { messages: this.messages, model: this.model, maxTokens: this.maxTokens, temperature: this.temperature, strictSchema: this.strictSchema, validator: serializeFunction(this.validator, 'validator'), retrier: serializeFunction(this.retrier, 'retrier'), stream: this.stream }
  }

  static from(value) { return value instanceof JobRequest ? value : new JobRequest(value) }
}
