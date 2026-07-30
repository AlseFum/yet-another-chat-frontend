const fieldTypes = new Set(['number', 'text', 'select', 'textarea', 'boolean'])

function fallback(schema, field) {
  if (field.default !== undefined) return field.default
  if (field.type === 'boolean') return false
  if (field.type === 'number') return field.min ?? 0
  if (field.type === 'select') return field.options?.[0]?.value ?? ''
  return ''
}

export function resolveCustomSettings(schema = {}, saved = {}) {
  return Object.fromEntries(Object.entries(schema).map(([name, field]) => [name, normalizeCustomSetting(field, saved[name], fallback(schema, field))]))
}

export function normalizeCustomSetting(field, value, defaultValue = '') {
  if (!fieldTypes.has(field?.type)) throw new TypeError(`不支持的 customSetting 类型 ${field?.type}`)
  if (value === undefined || value === null) return defaultValue
  if (field.type === 'number') {
    const number = Number(value)
    if (!Number.isFinite(number)) return defaultValue
    const minimum = field.min ?? number
    const maximum = field.max ?? number
    const clamped = Math.min(maximum, Math.max(minimum, number))
    if (!field.step) return clamped
    const stepped = minimum + Math.round((clamped - minimum) / field.step) * field.step
    return Math.min(maximum, Math.max(minimum, Number(stepped.toFixed(12))))
  }
  if (field.type === 'boolean') return Boolean(value)
  if (field.type === 'select') return field.options?.some(option => option.value === value) ? value : defaultValue
  return String(value).slice(0, field.type === 'text' ? 80 : undefined)
}
