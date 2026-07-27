export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function pick(obj, keys) {
  const result = {}
  for (const key of keys) if (key in obj) result[key] = obj[key]
  return result
}

export function pickWithDefaults(obj, keyDefaults) {
  const result = {}
  for (const key of Object.keys(keyDefaults)) result[key] = key in obj ? obj[key] : keyDefaults[key]
  return result
}

export function omit(obj, keys) {
  const excluded = new Set(keys)
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !excluded.has(key)))
}

export const removeByKey = (array, key, value) => array.filter(item => item[key] !== value)
export const replaceArray = (array, items) => array.splice(0, array.length, ...items)
export const safeJson = response => response.json().catch(() => ({}))
export const coerceNum = (value, fallback = 0) => Number.isNaN(parseFloat(value)) ? fallback : parseFloat(value)
export const coerceNumFallback = (...candidates) => {
  for (const value of candidates) if (value != null && value !== '' && !Number.isNaN(parseFloat(value))) return parseFloat(value)
  return 0
}
export const stringifyResult = value => typeof value === 'string' ? value : JSON.stringify(value)
export const asArray = value => Array.isArray(value) ? value : []
