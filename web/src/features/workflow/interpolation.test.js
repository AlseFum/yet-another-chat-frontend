import assert from 'node:assert/strict'
import {
  createInterpolationContext,
  evaluateCondition,
  interpolateJSON,
  interpolateText,
  referencedNodeIds,
} from './interpolation.js'

const context = createInterpolationContext({
  inputs: { in0: { title: 'Report', tags: ['draft'] }, in1: 3 },
  nodes: [{ type: 'input', data: { variables: [{ name: 'topic', value: 'workflow' }] } }],
  results: { n1: { output: { owner: { name: 'Lin' } } } },
})

assert.equal(interpolateText('{{in0.title}}: {{var.topic}} / {{node.n1.owner.name}}', context), 'Report: workflow / Lin')
assert.equal(interpolateText('Missing {{var.none}} stays visible', context), 'Missing {{var.none}} stays visible')
assert.deepEqual(interpolateJSON('{"payload":"{{in0}}","count":"{{in1}}","text":"#{{in0.title}}"}', context), {
  payload: { title: 'Report', tags: ['draft'] }, count: 3, text: '#Report',
})
assert.equal(evaluateCondition('{{in0.title}} === "Report" && {{in1}} > 2', context), true)
assert.deepEqual([...referencedNodeIds({ type: 'prompt', data: { prompt: '{{node.n1.owner.name}}', sysPrompt: '{{node.n2}}' } })], ['n1', 'n2'])

console.log('Workflow interpolation test passed')
