import assert from 'node:assert/strict'
import { formatDateTimeLocal, parseDateTimeLocal } from './clock.js'

const instant = '2026-01-01T00:00:00.000Z'
assert.equal(formatDateTimeLocal(instant, 'Asia/Shanghai'), '2026-01-01T08:00')
assert.equal(parseDateTimeLocal('2026-01-01T08:00', 'Asia/Shanghai').toISOString(), instant)
assert.equal(parseDateTimeLocal('2026-01-01T00:00', 'UTC').toISOString(), instant)
assert.equal(parseDateTimeLocal('invalid', 'Asia/Shanghai'), null)

console.log('Talk clock test passed')
