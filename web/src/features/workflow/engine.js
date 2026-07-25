import { toast } from '../../components/Toast.vue'

/**
 * 工作流执行引擎
 * =================
 * 负责：变量插值、图算法（拓扑排序）、节点按序执行
 *
 * 整体流程：
 * 1. buildGraph() — 从 nodes + edges 构建邻接表
 * 2. topoSort()  — Kahn 算法 BFS 拓扑排序
 * 3. executeWorkflow() — 按拓扑序逐节点执行
 *
 * 每个节点执行时：
 * - 查找所有前驱节点（edges 中 target === 当前 id 的边）
 * - 收集前驱的 output 作为上下文
 * - 插值解析 {{in0}}、{{var.name}} 与 {{node.id.path}}
 * - 执行节点逻辑（调用 LLM / 运行工具 / 条件判断 / 文本拼装）
 * - 结果存入 execResults，错误捕获后标记 status: 'error'
 *
 * 节点引用：
 * - {{node.id.path}} 会加入隐式执行依赖，保证读取的节点已经完成
 *
 * 条件分支：
 * - ConditionNode 有 true/false 两个出口 Handle
 * - 执行时根据表达式求值，condResults 记录结果
 * - 下游节点检查前驱条件，匹配则跳过
 */

import { getExecutor } from './registry.js'
import { createInterpolationContext, referencedNodeIds } from './interpolation.js'

/** 从入边构建端口上下文：{ in0: source.output, ... } */
export function buildInputs(inEdges, results) {
  const vars = {}
  for (const e of inEdges) {
    const r = results[e.source]
    if (r) vars[e.targetHandle] = r.output
  }
  return vars
}

/**
 * 构建图的邻接表
 * 从 nodes + edges 生成：
 *   adj[nodeId] = { node, next[], condNext: { true: [], false: [] } }
 *   inDegree[nodeId] = 入度计数
 *   nodeMap[nodeId] = 节点对象
 *
 * 条件节点的出边特殊处理：根据 sourceHandle 是 'true' 还是 'false' 分别放入 condNext
 *
 * @param {Array} nodes - 节点数组
 * @param {Array} edges - 边数组
 * @returns {{ adj, inDegree, nodeMap }}
 */
export function buildGraph(nodes, edges) {
  const adj = {}
  const inDegree = {}
  const nodeMap = {}
  // 初始化：每个节点建立邻接入口
  for (const n of nodes) {
    adj[n.id] = { node: n, next: [], condNext: { true: [], false: [] } }
    inDegree[n.id] = 0
    nodeMap[n.id] = n
  }
  // 遍历边填充邻接关系
  for (const e of edges) {
    if (!adj[e.source] || !adj[e.target]) continue // 孤立边跳过
    const srcNode = nodeMap[e.source]
    if (srcNode?.type === 'condition') {
      // 条件节点 → 根据出口 Handle 分别放入 true/false 分支
      const branch = e.sourceHandle === 'false' ? 'false' : 'true'
      adj[e.source].condNext[branch].push(e.target)
    } else {
      // 普通节点 → 统一放入 next
      adj[e.source].next.push(e.target)
    }
    // 目标节点入度 +1
    inDegree[e.target] = (inDegree[e.target] || 0) + 1
  }

  // Explicit node references are data dependencies even without a visible
  // edge. Add them to the execution graph so a parallel level never reads an
  // unfinished referenced result.
  const visibleLinks = new Set(edges.map(edge => `${edge.source}\u0000${edge.target}`))
  for (const node of nodes) {
    for (const source of referencedNodeIds(node)) {
      if (source === node.id || !adj[source] || visibleLinks.has(`${source}\u0000${node.id}`)) continue
      adj[source].next.push(node.id)
      inDegree[node.id]++
    }
  }
  return { adj, inDegree, nodeMap }
}

/**
 * BFS 层级分组
 * 从入度为 0 的节点出发，逐层 BFS，同一层的节点互不依赖，可并行执行。
 * 条件节点单独一层（其下游需要等条件结果才决定跳过谁）。
 *
 * @returns {Array<Array<string>>} 每层是一组可并行的节点 ID
 */
export function levelGroup(inDegree, adj) {
  const levels = []
  const deg = { ...inDegree }
  let queue = Object.keys(deg).filter(id => deg[id] === 0)
  while (queue.length) {
    levels.push(queue)
    const next = []
    for (const id of queue) {
      for (const nxt of [...adj[id].next, ...adj[id].condNext.true, ...adj[id].condNext.false]) {
        deg[nxt]--
        if (deg[nxt] === 0) next.push(nxt)
      }
    }
    queue = next
  }
  if (levels.flat().length !== Object.keys(deg).length) throw new Error('工作流存在循环依赖或无效的节点引用')
  return levels
}

/**
 * 执行工作流
 * 这是整个引擎的入口函数，由 WorkflowView.vue 的 ▶ 按钮触发
 *
 * 同一层级内的节点通过 Promise.all 并行执行。条件节点单独评估，其下游根据结果跳过。
 */

/** 执行单个节点，返回 void，结果写入 $wfs.execResults */
/** 调度到注册表的执行器 */
async function execNode($wfs, node, id, condResults, workflow, wfAsyncCall) {
  $wfs.currentExecNode = id
  $wfs.execStates[id] = 'running'
  $wfs.execLogs.push(`[执行] ${node.data.label || id}`)
  console.group(`[${node.type}] ${node.data.label || id}`)
  await new Promise(r => setTimeout(r, 100))

  const inEdges = $wfs.edges.filter(e => e.target === id)
  const portInputs = buildInputs(inEdges, $wfs.execResults)
  const context = createInterpolationContext({ inputs: portInputs, nodes: $wfs.nodes, results: $wfs.execResults })
  const runner = getExecutor(node.type)
  if (!runner) {
    $wfs.execStates[id] = 'failed'
    $wfs.execLogs.push(`  [错误] 未知节点类型: ${node.type}`)
    console.groupEnd(); $wfs.currentExecNode = null; return
  }

  try {
    const output = await runner({
      node, id, inEdges,
      inputs: portInputs,
      context,
      results: $wfs.execResults,
      condResults, workflow,
      $wfs, wfAsyncCall,
    })
    $wfs.execResults[id] = { output: output ?? '', status: 'ok' }
    $wfs.execStates[id] = 'completed'
    if (node.data) node.data.result = output ?? ''
    $wfs.execLogs.push(`  [完成] ${node.data.label || id}${output ? ': ' + String(output).slice(0, 80) : ''}`)
  } catch (e) {
    $wfs.execResults[id] = { output: e.message, status: 'error' }
    $wfs.execStates[id] = 'failed'
    $wfs.execLogs.push(`  [错误] ${e.message}`)
    toast.error(`流程节点“${node.data.label || id}”执行失败: ${e.message}`)
  } finally {
    $wfs.currentExecNode = null; console.groupEnd()
  }
}

/**
 * 执行工作流（入口）
 *
 * 流程：
 * 1. 重置执行状态
 * 2. 构建图 + 拓扑排序
 * 3. 收集所有 InputNode 的变量 → ctx._inputs
 * 4. 按拓扑序遍历节点
 *    a. 检查条件分支 — 如果前驱是条件节点且不该走这条路，跳过
 *    b. 根据节点类型执行对应逻辑（input/text/prompt/tool/condition/output）
 *    c. 结果存入 execResults
 *    d. 调用 debouncedSave 持久化
 * 5. 结束后标记 executing = false
 *
 * @param {object} ctx.refs      - Vue ref 集合 { nodes, edges, executing, execResults, execLogs, currentExecNode, showResults }
 * @param {function} ctx.wfAsyncCall - 异步桥接函数，用于调用 LLM/工具并等待结果
 * @param {function} ctx.debouncedSave - 防抖保存到 JSON
 */
export async function executeWorkflow({ runtime: $wfs, wfAsyncCall, debouncedSave, workflow }) {
  if ($wfs.executing) return
  $wfs.executing = true

  $wfs.execResults = {}
  $wfs.execLogs = []
  $wfs.execStates = Object.fromEntries($wfs.nodes.map(node => [node.id, 'waiting']))
  $wfs.showResults = true

  const { adj, inDegree, nodeMap } = buildGraph($wfs.nodes, $wfs.edges)
  const levels = levelGroup(inDegree, adj)
  const condResults = {}

  // 4. 逐层级并行执行
  for (const level of levels) {
    await Promise.all(level.map(id => {
      const node = nodeMap[id]
      if (!node) return
      const preds = $wfs.edges.filter(e => e.target === id)
      let skip = false
      for (const pred of preds) {
        const pn = nodeMap[pred.source]
        if (pn?.type === 'condition') {
          if (pred.sourceHandle === 'false' && condResults[pred.source] === true) { $wfs.execStates[id] = 'skipped'; $wfs.execLogs.push(`[跳过] ${node.data.label || id}`); skip = true; break }
          if (pred.sourceHandle === 'true' && condResults[pred.source] === false) { $wfs.execStates[id] = 'skipped'; $wfs.execLogs.push(`[跳过] ${node.data.label || id}`); skip = true; break }
        }
      }
      if (skip) return
      return execNode($wfs, node, id, condResults, workflow, wfAsyncCall)
    }))
  }

  $wfs.executing = false
  $wfs.execLogs.push('[完成] 流程执行完毕')
  debouncedSave()
}
