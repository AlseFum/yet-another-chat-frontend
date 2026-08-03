import assert from 'node:assert/strict'
import { isRecord, match, matches, matchTag, P } from './match.js'

assert.equal(match([], [[P.array, () => 'array'], [P._, () => 'other']]), 'array')
assert.equal(match({ id: 'a', status: 'running' }, [[P.shape({ status: P.oneOf('running', 'idle') }), value => value.id], [P._, () => null]]), 'a')
assert.equal(match(4, [[P.when(value => value > 3), () => 'large'], [P.number, () => 'number']]), 'large')
assert.equal(matches(null, P.nullish), true)
assert.equal(isRecord({}), true)
assert.equal(isRecord([]), false)
assert.equal(isRecord(null), false)
assert.equal(matchTag('delta', { delta: value => value }, null)('ok'), 'ok')
assert.equal(matchTag('__proto__', {}, () => 'safe')(), 'safe')
assert.throws(() => match('unknown', [['known', () => true]]), /未处理/)
assert.throws(() => matchTag('unknown', {}), /未处理/)
console.log('pattern matching tests passed')
