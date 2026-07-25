import assert from 'node:assert/strict'
import { findNearestOpenPosition } from './graph.js'

const center = { x: 220, y: 160 }
assert.deepEqual(findNearestOpenPosition([], center), { x: 120, y: 100 })

const occupied = [{ id: 'n1', position: { x: 120, y: 100 }, dimensions: { width: 200, height: 120 }, data: {} }]
const position = findNearestOpenPosition(occupied, center)
assert.notDeepEqual(position, { x: 120, y: 100 })
assert.ok(Math.abs(position.x - 120) <= 120 || Math.abs(position.y - 100) <= 90)

console.log('Workflow placement test passed')
