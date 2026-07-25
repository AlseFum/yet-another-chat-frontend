/**
 * 工作流图管理
 * =================
 * 负责：画布节点和边的 CRUD、持久化防抖、VueFlow 事件处理
 *
 * 注意：模板中 ref 会被 Vue 自动解包，所以函数签名接收的是数组本身（不是 ref）
 * 在 script 中调用时需手动传 .value
 *
 * 节点类型与默认配置：
 *   input     — 定义输入变量，变量可在下游用 {{$inputs.key}} 引用
 *   prompt    — 调用 LLM，提示词模板支持 {{$prev}} {{$all}} {{$inputs.key}}
 *   tool      — 执行 JS 工具函数，args 支持 JSON + 插值
 *   condition — 布尔表达式分支，true/false 两个出口
 *   text      — 纯文本模板拼接
 *   output    — 终端节点，收集并显示上游结果
 */

/**
 * 从持久化数据加载工作流到画布
 * 用 splice 替换整个数组以保持引用不变（不破坏 v-model 绑定）
 *
 * @param {object} workflow    - 工作流数据
 * @param {Array} nodes        - 节点数组
 * @param {Array} edges        - 边数组
 * @param {Object} execResults - 执行结果
 * @param {Array} execLogs     - 执行日志
 */
export function loadWorkflow(workflow, nodes, edges, execResults, execLogs) {
  if (!workflow) return
  // splice 替换全部元素，保持数组引用；清理旧的 _inputCount 以启用动态 handle
  replaceArray(nodes, (workflow.nodes || []).map(n => {
    const data = { ...n.data }
    delete data._inputCount
    delete data._pendingNewHandle
    return { ...n, data }
  }))
  replaceArray(edges, (workflow.edges || []).map(e => ({ ...e })))
  Object.assign(execResults, workflow.lastResults || {})
  replaceArray(execLogs, workflow.lastLogs || [])
}

/**
 * VueFlow connect 事件处理 — 创建新边
 *
 * 如果 targetHandle === '_new'（拖拽自动创建的临时 handle），
 * 则将该临时 handle 转为永久 handle（递增 _inputCount）并重命名。
 *
 * @param {object} conn   - VueFlow 连接对象 { source, target, sourceHandle, targetHandle }
 * @param {Array} edges   - 边数组
 * @param {Array} nodes   - 节点数组
 */
export function onConnect(conn, edges, nodes) {
  if (conn.source === conn.target) return

  let sourceHandle = conn.sourceHandle || 'out'
  let targetHandle = conn.targetHandle || 'in0'

  // 连到 _new → 为其分配一个顺位 handle ID
  if (targetHandle === '_new') {
    const used = edges.filter(e => e.target === conn.target).length
    targetHandle = 'in' + used
  }

  // 去重
  const dup = edges.some(
    e => e.source === conn.source
      && e.target === conn.target
      && e.sourceHandle === sourceHandle
      && e.targetHandle === targetHandle
  )
  if (dup) return

  edges.splice(edges.length, 0, {
    id: `e-${conn.source}-${conn.target}-${Date.now().toString(36)}`,
    source: conn.source,
    target: conn.target,
    sourceHandle,
    targetHandle,
    type: 'bezier',
    animated: true,
  })
}

/**
 * VueFlow edgesChange 事件 — 处理边删除（键盘 Delete）
 *
 * @param {Array} changes  - VueFlow 变更列表
 * @param {Array} edges    - 边数组
 */
export function onEdgesChange(changes, edges) {
  for (const change of changes) if (change.type === 'remove') removeEdge(change.id, edges)
}

function reindexTargetHandles(target, edges) {
  const targetEdges = edges.filter(edge => edge.target === target)
  targetEdges.sort((a, b) => {
    const ai = parseInt((a.targetHandle || 'in0').replace('in', ''))
    const bi = parseInt((b.targetHandle || 'in0').replace('in', ''))
    return ai - bi
  })
  targetEdges.forEach((edge, index) => { edge.targetHandle = `in${index}` })
}

export function removeEdge(id, edges) {
  const index = edges.findIndex(edge => edge.id === id)
  if (index < 0) return false
  const [edge] = edges.splice(index, 1)
  reindexTargetHandles(edge.target, edges)
  return true
}

/**
 * VueFlow nodesChange 事件 — 处理节点删除
 * 删除节点时同时清理所有关联边
 *
 * @param {Array} changes  - VueFlow 变更列表
 * @param {Array} nodes    - 节点数组
 * @param {Array} edges    - 边数组
 */
export function onNodesChange(changes, nodes, edges) {
  for (const change of changes) if (change.type === 'remove') removeNode(change.id, nodes, edges)
}

export function removeNode(id, nodes, edges) {
  const index = nodes.findIndex(node => node.id === id)
  if (index < 0) return false
  nodes.splice(index, 1)
  const affectedTargets = new Set(edges.filter(edge => edge.source === id || edge.target === id).map(edge => edge.target))
  for (let index = edges.length - 1; index >= 0; index--) {
    if (edges[index].source === id || edges[index].target === id) edges.splice(index, 1)
  }
  for (const target of affectedTargets) if (target !== id) reindexTargetHandles(target, edges)
  return true
}

/**
 * 在画布上添加新节点
 * 从当前视图中心开始，以由近到远的网格搜索避开已有节点。
 *
 * @param {string} type   - 节点类型 (input|prompt|tool|condition|text|output)
 * @param {Array} nodes   - 节点数组
 */
/**
 * 节点增删和持久化
 */
import { getDefaults } from './registry.js'
import { replaceArray } from '../../../../util/data.js'

// 兜底默认值（registry 未注册时用）
const FALLBACK = {
  input:     { label: '输入', variables: [{ name: 'var1', value: '' }], _inputCount: 1 },
  prompt:    { label: 'AI 对话', prompt: '', sysPrompt: '', presetId: '', _inputCount: 1 },
  tool:      { label: '工具', toolName: '', args: '{}', _inputCount: 1 },
  condition: { label: '条件', condition: '', _inputCount: 1 },
  text:      { label: '文本', text: '', _inputCount: 1 },
  output:    { label: '输出', _inputCount: 1 },
  debug:     { label: '调试', _inputCount: 1 },
}

const DEFAULT_NODE_SIZE = { width: 200, height: 120 }
const PLACEMENT_STEP = { x: 120, y: 90 }
const PLACEMENT_PADDING = 24

function nodeRect(node) {
  const position = node.computedPosition || node.positionAbsolute || node.position || { x: 0, y: 0 }
  return {
    x: position.x,
    y: position.y,
    width: node.dimensions?.width || node.width || node.data?._w || DEFAULT_NODE_SIZE.width,
    height: node.dimensions?.height || node.height || node.data?._h || DEFAULT_NODE_SIZE.height,
  }
}

function overlaps(candidate, occupied) {
  return candidate.x < occupied.x + occupied.width + PLACEMENT_PADDING
    && candidate.x + candidate.width + PLACEMENT_PADDING > occupied.x
    && candidate.y < occupied.y + occupied.height + PLACEMENT_PADDING
    && candidate.y + candidate.height + PLACEMENT_PADDING > occupied.y
}

export function findNearestOpenPosition(nodes, center = { x: 220, y: 160 }) {
  const base = {
    x: Math.round((center.x - DEFAULT_NODE_SIZE.width / 2) / 20) * 20,
    y: Math.round((center.y - DEFAULT_NODE_SIZE.height / 2) / 20) * 20,
  }
  const occupied = nodes.map(nodeRect)
  const candidates = []
  for (let ring = 0; ring <= 12; ring++) {
    for (let x = -ring; x <= ring; x++) {
      for (let y = -ring; y <= ring; y++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue
        candidates.push({ x: base.x + x * PLACEMENT_STEP.x, y: base.y + y * PLACEMENT_STEP.y, distance: x * x + y * y })
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)
  for (const candidate of candidates) {
    const rect = { ...candidate, ...DEFAULT_NODE_SIZE }
    if (!occupied.some(existing => overlaps(rect, existing))) return { x: candidate.x, y: candidate.y }
  }
  return { x: base.x + 13 * PLACEMENT_STEP.x, y: base.y + 13 * PLACEMENT_STEP.y }
}

export function addNode(type, nodes, center) {
  const id = 'n' + Date.now().toString(36)
  const node = {
    id, type, position: { x: 0, y: 0 },
    data: { ...FALLBACK[type], ...getDefaults(type) },
  }
  node.position = findNearestOpenPosition(nodes, center)
  nodes.push(node)
  return node
}

/**
 * 清空画布
 */
export function clearAll(nodes, edges, execResults, execLogs) {
  if (!confirm('清空当前流程？')) return
  nodes.length = 0
  edges.length = 0
  Object.keys(execResults).forEach(k => delete execResults[k])
  execLogs.length = 0
}

/**
 * 防抖持久化工厂
 * 当 nodes 或 edges 变化时，300ms 后自动 save 到 JSON
 *
 * @param {Function} emit     - emit 函数
 * @param {object} props      - 组件 props
 * @param {Function} getNodes - 获取节点数组的函数（用于获取最新值）
 * @param {Function} getEdges - 获取边数组的函数
 * @param {Function} getResults - 获取执行结果的函数
 * @param {Function} getLogs   - 获取执行日志的函数
 * @returns {Function} 调用后启动防抖保存
 */
export function createDebouncedSave(emit, props, getNodes, getEdges, getResults, getLogs) {
  let saveTimer = null
  return function debouncedSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      emit('save', {
        ...props.workflow,
        nodes: JSON.parse(JSON.stringify(getNodes())),
        edges: JSON.parse(JSON.stringify(getEdges())),
        lastResults: { ...getResults() },
        lastLogs: [...getLogs()],
      })
    }, 300)
  }
}
