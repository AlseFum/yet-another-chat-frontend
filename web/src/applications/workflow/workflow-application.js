import { executeWorkflow } from './workflow-engine.js'
import { evaluateCondition, interpolateJSON, interpolateText } from './workflow-interpolation.js'
import { createWorkflowPromptJobRequest } from './workflow-job-request.js'
import { expandTextReferences } from '../../workspace/text-reference.js'
import { matchTag } from '../../../../util/match.js'

const copy = value => JSON.parse(JSON.stringify(value))
const id = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const transientNodeData = new Set(['streamingText', 'streamingReasoning'])

export function normalizeWorkflowNode(node) {
  const data = Object.fromEntries(Object.entries(node?.data || {}).filter(([key]) => !transientNodeData.has(key)))
  return { id: node.id, type: node.type, position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 }, data: copy(data) }
}

export function normalizeWorkflowEdge(edge) {
  return { id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || 'out', targetHandle: edge.targetHandle || 'in0', type: edge.type || 'bezier', animated: edge.animated !== false }
}

export const WORKFLOW_NODE_TYPES = {
  input: { label: '输入', icon: 'input', defaults: { label: '输入', variables: [{ name: 'topic', value: '' }] } },
  text: { label: '文本', icon: 'file', defaults: { label: '文本', text: '{{in0}}' } },
  prompt: { label: 'AI', icon: 'robot', defaults: { label: 'AI 对话', prompt: '{{in0}}', systemPrompt: '', presetId: '', api: { keyRefId: null }, requestOptions: { model: '', temperature: null, maxTokens: null, thinking: null, stream: null } } },
  tool: { label: '工具', icon: 'tool', defaults: { label: '工具调用', toolId: '', args: '{\n  "input": "{{in0}}"\n}', timeoutMs: 30000, errorPolicy: 'stop' } },
  condition: { label: '条件', icon: 'condition', defaults: { label: '条件', condition: 'Boolean({{in0}})' } },
  output: { label: '输出', icon: 'output', defaults: { label: '输出' } },
}

export function resolvePromptNodeConfig(node, workflow) {
  const nodeOptions = node?.data?.requestOptions || {}
  const inherited = workflow?.requestOptions || {}
  const value = name => nodeOptions[name] === null || nodeOptions[name] === undefined || nodeOptions[name] === '' ? inherited[name] : nodeOptions[name]
  return {
    keyRefId: node?.data?.api?.keyRefId || workflow?.api?.keyRefId || null,
    requestOptions: {
      model: value('model'),
      temperature: value('temperature'),
      maxTokens: value('maxTokens'),
      thinking: value('thinking'),
      stream: value('stream'),
    },
  }
}

function normalizeWorkflow(value, defaults = {}) {
  const requestDefaults = Object.fromEntries(['model', 'temperature', 'maxTokens', 'thinking', 'stream'].map(name => [name, defaults[name]]).filter(([, setting]) => setting !== undefined))
  return {
    id: value.id || id('workflow'), name: value.name || '未命名流程',
    api: { keyRefId: value.api?.keyRefId || null },
    requestOptions: { model: 'deepseek-v4-flash', temperature: 0.7, maxTokens: 4096, thinking: true, stream: true, ...requestDefaults, ...value.requestOptions },
    nodes: Array.isArray(value.nodes) ? value.nodes.map(normalizeWorkflowNode) : [], edges: Array.isArray(value.edges) ? value.edges.map(normalizeWorkflowEdge) : [],
    lastRun: value.lastRun || null,
  }
}

export class WorkflowApplication {
  static schema() {
    return {
      useInjectedPrompt: { type: 'boolean', label: '使用 Workflow 注入 Prompt', default: false },
      injectedPrompt: { type: 'textarea', label: 'Workflow 注入 Prompt', description: '追加到每个 Prompt 节点最前方。', variables: ['workflowName', 'nodeName'], default: '' },
      model: { type: 'text', label: '新 Workflow 默认模型', default: 'deepseek-v4-flash' },
      temperature: { type: 'number', label: '新 Workflow 默认 Temperature', default: 0.7, min: 0, max: 2, step: 0.1 },
      maxTokens: { type: 'number', label: '新 Workflow 默认 Max tokens', default: 4096, min: 1, step: 1 },
      thinking: { type: 'boolean', label: '新 Workflow 默认启用思维过程', default: true },
      stream: { type: 'boolean', label: '新 Workflow 默认流式输出', default: true },
    }
  }

  constructor() { this.id = 'workflow'; this.stateKey = 'workflow'; this.workspace = null; this.workflows = []; this.ui = { activeWorkflowId: null }; this.controllers = new Map(); this.resumeStarted = new Set() }
  revive(workspace) { this.workspace = workspace; const state = workspace.state.get(this.stateKey, {}); this.workflows = (state.workflows || []).map(item => normalizeWorkflow(item)); this.ui = { activeWorkflowId: null, ...state.ui } }
  init() { if (!this.activeWorkflow) this.ui.activeWorkflowId = this.workflows[0]?.id || null; for (const workflow of this.workflows) if (workflow.lastRun?.status === 'running') void this.resume(workflow.id) }
  get activeWorkflow() { return this.workflows.find(item => item.id === this.ui.activeWorkflowId) || null }
  get tools() { return this.workspace?.resources.list('tool') || [] }
  get presets() { return this.workspace?.resources.list('preset') || [] }
  sync() { this.workspace.state.set(this.stateKey, { workflows: this.workflows.map(workflow => { const { nodes, edges, ...data } = workflow; return { ...copy(data), nodes: nodes.map(normalizeWorkflowNode), edges: edges.map(normalizeWorkflowEdge) } }), ui: { ...this.ui } }) }
  save() { this.sync(); return this.workspace.saveState() }
  select(workflowId) { if (this.workflows.some(item => item.id === workflowId)) { this.ui.activeWorkflowId = workflowId; return this.save() } }
  create(name = '') { const settings = this.workspace.getCustomSettings(this.id); const workflow = normalizeWorkflow({ name: name.trim() || `流程 ${this.workflows.length + 1}` }, settings); this.workflows.push(workflow); this.ui.activeWorkflowId = workflow.id; return workflow }
  async remove(workflowId) { this.stop(workflowId); const index = this.workflows.findIndex(item => item.id === workflowId); if (index < 0) return; this.workflows.splice(index, 1); if (this.ui.activeWorkflowId === workflowId) this.ui.activeWorkflowId = this.workflows[index]?.id || this.workflows[index - 1]?.id || null; return this.save() }
  async update(workflowId, patch) { const workflow = this.workflows.find(item => item.id === workflowId); if (!workflow) return; Object.assign(workflow, copy(patch), { id: workflow.id }); return this.save() }
  addNode(type, position = { x: 100, y: 100 }) { const workflow = this.activeWorkflow; const definition = WORKFLOW_NODE_TYPES[type]; if (!workflow || !definition) return null; const node = { id: id('node'), type, position, data: copy(definition.defaults) }; workflow.nodes.push(node); return node }
  connect(connection) {
    const workflow = this.activeWorkflow
    if (!workflow || connection.source === connection.target) return
    const incoming = workflow.edges.filter(edge => edge.target === connection.target)
    const occupied = new Set(incoming.map(edge => edge.targetHandle || 'in0'))
    let targetHandle = connection.targetHandle || 'in0'
    if (targetHandle === '_new' || occupied.has(targetHandle)) {
      let index = 0
      while (occupied.has(`in${index}`)) index++
      targetHandle = `in${index}`
    }
    if (workflow.edges.some(edge => edge.source === connection.source && edge.target === connection.target && edge.sourceHandle === (connection.sourceHandle || 'out'))) return
    workflow.edges.push({ id: id('edge'), source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle || 'out', targetHandle, type: 'bezier', animated: true })
  }
  removeElements(nodeIds = [], edgeIds = []) { const workflow = this.activeWorkflow; const removed = new Set(nodeIds); workflow.nodes = workflow.nodes.filter(node => !removed.has(node.id)); workflow.edges = workflow.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target) && !edgeIds.includes(edge.id)) }

  async run(workflowId = this.ui.activeWorkflowId, { resume = false } = {}) {
    const workflow = this.workflows.find(item => item.id === workflowId)
    if (!workflow) throw new Error('找不到 Workflow')
    if (!workflow.nodes.length) throw new Error('请先添加节点')
    const controller = new AbortController(); this.controllers.set(workflow.id, controller)
    if (!resume) for (const node of workflow.nodes) if (node.data) delete node.data.result
    const run = resume ? workflow.lastRun : { id: id('workflow-run'), status: 'running', startedAt: new Date().toISOString(), completedAt: null, states: {}, results: {}, logs: [], jobs: [] }
    workflow.lastRun = run; await this.save()
    const log = message => { run.logs.push(`[${new Date().toLocaleTimeString()}] ${message}`); if (run.logs.length > 120) run.logs.shift() }
    try {
      run.results = await executeWorkflow({ nodes: workflow.nodes, edges: workflow.edges, signal: controller.signal, initialResults: run.results, initialStates: run.states, onState: (nodeId, status) => { run.states[nodeId] = status }, onResult: () => { void this.save() }, onLog: log, executeNode: input => this.executeNode(workflow, run, input) })
      run.status = Object.values(run.states).includes('failed') ? 'completed_with_errors' : 'completed'
      log(run.status === 'completed' ? '流程执行完毕' : '流程执行完毕，部分节点失败')
      return run.results
    } catch (error) {
      run.status = error.name === 'AbortError' ? 'cancelled' : 'failed'; run.error = error.message; throw error
    } finally {
      run.completedAt = new Date().toISOString(); this.controllers.delete(workflow.id); await this.save()
    }
  }

  async resume(workflowId) {
    if (this.resumeStarted.has(workflowId)) return
    this.resumeStarted.add(workflowId)
    const workflow = this.workflows.find(item => item.id === workflowId)
    try {
      const activeEntries = (workflow?.lastRun?.jobs || []).filter(entry => entry.status !== 'completed')
      if (activeEntries.some(entry => !this.workspace.jobsManager.get(entry.jobId))) {
        workflow.lastRun.status = 'interrupted'; workflow.lastRun.error = '刷新后无法恢复临时或缺失的 AI Job'; await this.save(); return
      }
      await this.run(workflowId, { resume: true })
    } catch {} finally { this.resumeStarted.delete(workflowId) }
  }

  async retryFrom(nodeId, workflowId = this.ui.activeWorkflowId) {
    const workflow = this.workflows.find(item => item.id === workflowId)
    const run = workflow?.lastRun
    if (!workflow || !run || run.status === 'running') return
    const affected = new Set([nodeId])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of workflow.edges) if (affected.has(edge.source) && !affected.has(edge.target)) { affected.add(edge.target); changed = true }
    }
    for (const id of affected) {
      delete run.results[id]
      run.states[id] = 'waiting'
      const node = workflow.nodes.find(item => item.id === id)
      if (node?.data) { delete node.data.result; delete node.data.streamingText; delete node.data.streamingReasoning }
    }
    run.jobs = (run.jobs || []).filter(entry => !affected.has(entry.nodeId))
    run.status = 'running'; run.error = null; run.completedAt = null
    await this.save()
    return this.run(workflowId, { resume: true })
  }

  async executeNode(workflow, run, { node, incoming, inputs, context, results, conditions, signal }) {
    return matchTag(node.type, {
      input: () => Object.fromEntries((node.data.variables || []).map(item => [String(item.name || '').trim(), item.value]).filter(([name]) => name)),
       text: async () => expandTextReferences(interpolateText(node.data.text, context), this.workspace),
      condition: () => { const value = evaluateCondition(node.data.condition, context); conditions[node.id] = value; return value },
      output: () => { const values = incoming.map(edge => results[edge.source]?.output).filter(value => value !== undefined); return values.length < 2 ? values[0] ?? '' : values },
      tool: () => this.executeToolNode({ workflow, run, node, context, signal }),
      prompt: () => this.executeAINode({ workflow, run, node, context, signal }),
    }, () => { throw new Error(`未知节点类型 ${node.type}`) })()
  }

  async executeToolNode({ workflow, run, node, context, signal }) {
    const tool = this.workspace.resources.get('tool', node.data.toolId)
    if (!tool) throw new Error('工具不存在或尚未选择')
    const args = interpolateJSON(node.data.args, context)
    const logger = { log: (...values) => run.logs.push(`[Tool] ${values.map(String).join(' ')}`) }
    const execute = new Function('ctx', `"use strict"; return (async () => { ${tool.content || ''}\n})()`)
    const timeoutMs = Math.max(100, Number(node.data.timeoutMs) || 30000)
    const toolController = new AbortController()
    const abortTool = () => toolController.abort(signal?.reason || 'Workflow 已停止')
    signal?.addEventListener('abort', abortTool, { once: true })
    let timer
    try {
      return await Promise.race([
        execute({ args, fetch: globalThis.fetch, signal: toolController.signal, workspace: this.workspace, resources: this.workspace.resources, logger, job: { workflowId: workflow.id, runId: run.id, nodeId: node.id } }),
        new Promise((_, reject) => { timer = setTimeout(() => { toolController.abort('Tool timeout'); reject(new Error(`Tool 执行超过 ${timeoutMs}ms`)) }, timeoutMs) }),
      ])
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abortTool) }
  }

   async executeAINode({ workflow, run, node, context, signal }) {
    const config = resolvePromptNodeConfig(node, workflow)
    const existingEntry = [...(run.jobs || [])].reverse().find(entry => entry.nodeId === node.id && entry.status !== 'completed')
    const existingJob = existingEntry?.jobId ? this.workspace.jobsManager.get(existingEntry.jobId) : null
    const keyRef = existingJob ? null : config.keyRefId ? this.workspace.keyRefFor(config.keyRefId) : null
    if (!existingJob && !keyRef) throw new Error(`AI 节点「${node.data.label || node.id}」没有可用 API Key`)
     let systemPrompt = await expandTextReferences(interpolateText(node.data.systemPrompt, context), this.workspace)
    const preset = node.data.presetId ? this.workspace.resources.get('preset', node.data.presetId) : null
    if (preset) systemPrompt = [preset.content, systemPrompt].filter(Boolean).join('\n\n')
     const prompt = await expandTextReferences(interpolateText(node.data.prompt, context), this.workspace)
     const request = createWorkflowPromptJobRequest({ prompt, systemPrompt, requestOptions: config.requestOptions }, this.workspace.getCustomSettings(this.id))
    return this.executePromptJob(request, keyRef, workflow, run, node, signal)
  }

  executePromptJob(request, keyRef, workflow, run, node, signal) {
    return new Promise((resolve, reject) => {
      const existingEntry = [...(run.jobs || [])].reverse().find(entry => entry.nodeId === node.id && entry.status !== 'completed')
      let job = existingEntry?.jobId ? this.workspace.jobsManager.get(existingEntry.jobId) : null
      let output = job?.responseText || ''; let settled = false; let subscription = null; let pollTimer = null
      let reasoning = job?.reasoning || ''
      const onAbort = () => { if (job?.id) void this.workspace.abortJob(job.id); finish(reject, new DOMException('Workflow 已停止', 'AbortError')) }
      const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(pollTimer); subscription?.unsubscribe(); signal?.removeEventListener('abort', onAbort); callback(value) }
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      const entry = existingEntry || { nodeId: node.id, jobId: null, status: 'creating' }
      if (!existingEntry) run.jobs.push(entry)
      const stateCases = {
        completed: () => { entry.status = 'completed'; delete node.data.streamingText; delete node.data.streamingReasoning; finish(resolve, output || job?.responseText || '') },
        failed: state => { entry.status = state; finish(reject, new Error(`Prompt Job ${state}`)) },
        cancelled: state => { entry.status = state; finish(reject, new Error(`Prompt Job ${state}`)) },
        missing: state => { entry.status = state; finish(reject, new Error(`Prompt Job ${state}`)) },
      }
      const eventCases = {
        delta: event => { output = event.responseText ?? `${output}${event.content || ''}`; reasoning = event.responseReasoning ?? `${reasoning}${event.reasoning || ''}`; node.data.streamingText = output; node.data.streamingReasoning = reasoning },
        result: event => { output = event.rawText || output },
        state: event => matchTag(event.state, stateCases, () => {})(event.state),
      }
      const onEvent = event => matchTag(event.type, eventCases, () => {})(event)
      const poll = async () => {
        if (settled || !job?.id || this.workspace.jobsManager.source(job.id) === 'direct') return
        try {
          const response = await this.workspace.transport.loadJobs([job.id], { detail: true })
          const snapshot = response.jobs?.[0]
          if (snapshot) {
            Object.assign(job, snapshot)
            output = snapshot.responseText || output
            reasoning = snapshot.reasoning || reasoning
            node.data.streamingText = output
            node.data.streamingReasoning = reasoning
            if (snapshot.status === 'completed') return onEvent({ type: 'state', state: 'completed' })
            if (['failed', 'cancelled', 'missing'].includes(snapshot.status)) return onEvent({ type: 'state', state: snapshot.status })
          }
        } catch {}
        if (!settled) pollTimer = setTimeout(poll, 500)
      }
      if (job) {
        entry.status = job.status
        subscription = job.onEvent(onEvent)
        if (job.status === 'completed') { entry.status = 'completed'; return finish(resolve, job.responseText || output) }
        if (['failed', 'cancelled', 'missing'].includes(job.status)) return finish(reject, new Error(`Prompt Job ${job.status}`))
        void poll()
        return
      }
      this.workspace.createJob({ request, keyRef, metadata: { source: `workflow:${workflow.name}`, workflowId: workflow.id, runId: run.id, nodeId: node.id }, onEvent }).then(created => { job = created; entry.jobId = job.id; entry.status = job.status; void this.save(); if (signal?.aborted) return onAbort(); if (job.status === 'completed') return onEvent({ type: 'state', state: 'completed' }); void poll() }).catch(error => finish(reject, error))
    })
  }
  stop(workflowId = this.ui.activeWorkflowId) { this.controllers.get(workflowId)?.abort() }
  close() { for (const controller of this.controllers.values()) controller.abort(); this.controllers.clear() }
}
