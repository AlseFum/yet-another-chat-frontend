import assert from 'node:assert/strict'
import { buildGraph, executeWorkflow, levelGroup } from './workflow-engine.js'
import { createInterpolationContext, interpolateJSON, interpolateText } from './workflow-interpolation.js'
import { createWorkflowPromptJobRequest } from './workflow-job-request.js'
import { normalizeWorkflowEdge, normalizeWorkflowNode, resolvePromptNodeConfig, WorkflowApplication } from './workflow-application.js'

const context = createInterpolationContext({ inputs: { in0: { value: 4 } }, nodes: [{ type: 'input', data: { variables: [{ name: 'topic', value: '测试' }] } }], results: { source: { output: ['a', 'b'] } } })
assert.equal(interpolateText('{{var.topic}}/{{in0.value}}/{{node.source.0}}', context), '测试/4/a')
assert.deepEqual(interpolateJSON('{"value":"{{in0}}"}', context), { value: { value: 4 } })
assert.throws(() => interpolateJSON('{bad', context), /不是有效 JSON/)

const nodes = [
  { id: 'a', type: 'input', data: {} },
  { id: 'b', type: 'text', data: { text: '{{node.a}}' } },
  { id: 'c', type: 'output', data: {} },
]
const edges = [{ source: 'b', target: 'c', targetHandle: 'in0' }]
const graph = buildGraph(nodes, edges)
assert.deepEqual(levelGroup(graph.inDegree, graph.next), [['a'], ['b'], ['c']])

const states = {}
const result = await executeWorkflow({ nodes, edges, onState: (id, state) => { states[id] = state }, executeNode: async ({ node, incoming, results }) => node.id === 'a' ? 'seed' : node.id === 'b' ? `${results.a.output}-next` : results[incoming[0].source].output })
assert.equal(result.c.output, 'seed-next')
assert.equal(states.c, 'completed')
assert.equal(nodes.find(node => node.id === 'c').data.result, 'seed-next')
const resumedNodes = [{ id: 'done', type: 'text', data: {} }, { id: 'next', type: 'output', data: {} }]
let resumedExecutions = 0
const resumed = await executeWorkflow({ nodes: resumedNodes, edges: [{ source: 'done', target: 'next' }], initialResults: { done: { status: 'ok', output: 'persisted' } }, initialStates: { done: 'completed' }, executeNode: async ({ incoming, results }) => { resumedExecutions++; return results[incoming[0].source].output } })
assert.equal(resumedExecutions, 1)
assert.equal(resumed.next.output, 'persisted')
const continuingNodes = [{ id: 'bad', type: 'text', data: { errorPolicy: 'continue' } }, { id: 'after', type: 'output', data: {} }]
const continued = await executeWorkflow({ nodes: continuingNodes, edges: [{ source: 'bad', target: 'after' }], executeNode: async ({ node, incoming, results }) => { if (node.id === 'bad') throw new Error('expected'); return results[incoming[0].source].output } })
assert.equal(continued.bad.status, 'error')
assert.equal(continued.after.output, 'expected')

const request = createWorkflowPromptJobRequest({ prompt: '业务', systemPrompt: '节点', requestOptions: { model: 'model-a' } }, { useInjectedPrompt: true, injectedPrompt: '全局' })
assert.deepEqual(request.messages.map(item => item.content), ['全局', '节点', '业务'])
assert.equal(request.model, 'model-a')
const workflow = { api: { keyRefId: 'workflow-key' }, requestOptions: { model: 'workflow-model', temperature: 0.7, maxTokens: 4096, thinking: true, stream: true } }
assert.deepEqual(resolvePromptNodeConfig({ data: { api: { keyRefId: 'node-key' }, requestOptions: { model: 'node-model', temperature: 0, maxTokens: null, thinking: false, stream: null } } }, workflow), { keyRefId: 'node-key', requestOptions: { model: 'node-model', temperature: 0, maxTokens: 4096, thinking: false, stream: true } })
assert.equal(resolvePromptNodeConfig({ data: { api: {}, requestOptions: {} } }, workflow).keyRefId, 'workflow-key')
assert.deepEqual(normalizeWorkflowNode({ id: 'node-a', type: 'input', position: { x: 10, y: 20 }, dimensions: { width: 150 }, handleBounds: {}, data: { label: 'A', streamingText: 'temporary' } }), { id: 'node-a', type: 'input', position: { x: 10, y: 20 }, data: { label: 'A' } })
assert.deepEqual(normalizeWorkflowEdge({ id: 'edge-a', source: 'a', target: 'b', sourceNode: { large: true }, targetNode: { large: true } }), { id: 'edge-a', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in0', type: 'bezier', animated: true })

const application = new WorkflowApplication()
const persistedJob = { id: 'job-a', status: 'completed', responseText: 'recovered answer', reasoning: 'recovered reasoning', onEvent: () => ({ unsubscribe() {} }) }
const state = { value: null, set(_key, value) { this.value = value } }
application.workspace = { state, saveState: async () => {}, getCustomSettings: () => ({}), keyRefFor: () => null, jobsManager: { get: id => id === 'job-a' ? persistedJob : null, source: () => 'server' }, resources: { get: () => null }, transport: { loadJobs: async () => ({ jobs: [persistedJob] }) } }
application.workflows = [{ id: 'resume-workflow', name: '恢复测试', api: { keyRefId: null }, requestOptions: { model: 'model-a', temperature: 0, maxTokens: 100, thinking: false, stream: true }, nodes: [{ id: 'ai', type: 'prompt', position: { x: 0, y: 0 }, data: { label: 'AI', prompt: 'hello', systemPrompt: '', api: {}, requestOptions: {} } }, { id: 'out', type: 'output', position: { x: 200, y: 0 }, data: { label: '输出' } }], edges: [{ id: 'e', source: 'ai', target: 'out', sourceHandle: 'out', targetHandle: 'in0' }], lastRun: { id: 'run-a', status: 'running', states: { ai: 'running', out: 'waiting' }, results: {}, logs: [], jobs: [{ nodeId: 'ai', jobId: 'job-a', status: 'running' }] } }]
application.ui.activeWorkflowId = 'resume-workflow'
await application.run('resume-workflow', { resume: true })
assert.equal(application.activeWorkflow.lastRun.results.ai.output, 'recovered answer')
assert.equal(application.activeWorkflow.lastRun.results.out.output, 'recovered answer')
assert.equal(application.activeWorkflow.lastRun.status, 'completed')

application.activeWorkflow.edges = []
application.connect({ source: 'ai', target: 'out', sourceHandle: 'out', targetHandle: 'in0' })
application.connect({ source: 'another', target: 'out', sourceHandle: 'out', targetHandle: 'in0' })
assert.deepEqual(application.activeWorkflow.edges.map(edge => edge.targetHandle), ['in0', 'in1'])
console.log('workflow application tests passed')
