const patternKind = Symbol('pattern-kind')

const pattern = (kind, payload = null) => Object.freeze({ [patternKind]: kind, payload })

export const P = Object.freeze({
  _: pattern('any'),
  array: pattern('array'),
  record: pattern('record'),
  string: pattern('type', 'string'),
  number: pattern('type', 'number'),
  boolean: pattern('type', 'boolean'),
  nullish: pattern('nullish'),
  when: predicate => {
    if (typeof predicate !== 'function') throw new TypeError('P.when 需要 predicate 函数')
    return pattern('when', predicate)
  },
  oneOf: (...values) => pattern('oneOf', values),
  shape: value => pattern('shape', value),
})

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function matches(value, candidate) {
  if (!candidate?.[patternKind]) return Object.is(value, candidate)
  if (candidate[patternKind] === 'any') return true
  if (candidate[patternKind] === 'array') return Array.isArray(value)
  if (candidate[patternKind] === 'record') return isRecord(value)
  if (candidate[patternKind] === 'type') return typeof value === candidate.payload
  if (candidate[patternKind] === 'nullish') return value === null || value === undefined
  if (candidate[patternKind] === 'when') return Boolean(candidate.payload(value))
  if (candidate[patternKind] === 'oneOf') return candidate.payload.some(item => Object.is(value, item))
  if (candidate[patternKind] === 'shape') {
    if (!isRecord(value) || !isRecord(candidate.payload)) return false
    return Object.entries(candidate.payload).every(([key, child]) => Object.hasOwn(value, key) && matches(value[key], child))
  }
  return false
}

export function match(value, branches) {
  if (!Array.isArray(branches)) throw new TypeError('match branches 必须是数组')
  for (const branch of branches) {
    if (!Array.isArray(branch) || branch.length !== 2 || typeof branch[1] !== 'function') throw new TypeError('match branch 必须是 [pattern, handler]')
    if (matches(value, branch[0])) return branch[1](value)
  }
  throw new TypeError(`未处理的匹配值：${String(value)}`)
}

export function matchTag(tag, cases, otherwise = null) {
  const handler = Object.hasOwn(cases, tag) ? cases[tag] : otherwise
  if (typeof handler !== 'function') throw new TypeError(`未处理的标签：${String(tag)}`)
  return handler
}
