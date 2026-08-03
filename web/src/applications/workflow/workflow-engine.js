import { createInterpolationContext, referencedNodeIds } from './workflow-interpolation.js'

export function buildInputs(edges, results) {
  return Object.fromEntries(edges.map(edge => [edge.targetHandle || 'in0', results[edge.source]?.output]))
}

export function buildGraph(nodes, edges) {
  const nodeMap = Object.fromEntries(nodes.map(node => [node.id, node]))
  const next = Object.fromEntries(nodes.map(node => [node.id, new Set()]))
  const inDegree = Object.fromEntries(nodes.map(node => [node.id, 0]))
  const add = (source, target) => {
    if (!nodeMap[source] || !nodeMap[target] || next[source].has(target)) return
    next[source].add(target)
    inDegree[target]++
  }
  for (const edge of edges) add(edge.source, edge.target)
  for (const node of nodes) for (const source of referencedNodeIds(node)) add(source, node.id)
  return { nodeMap, next, inDegree }
}

export function levelGroup(inDegree, next) {
  const degrees = { ...inDegree }
  const levels = []
  let queue = Object.keys(degrees).filter(id => degrees[id] === 0)
  while (queue.length) {
    levels.push(queue)
    const following = []
    for (const id of queue) for (const target of next[id]) if (--degrees[target] === 0) following.push(target)
    queue = following
  }
  if (levels.flat().length !== Object.keys(degrees).length) throw new Error('工作流存在循环依赖或无效节点引用')
  return levels
}

export async function executeWorkflow({ nodes, edges, executeNode, onState = () => {}, onLog = () => {}, onResult = () => {}, signal, initialResults = {}, initialStates = {} } = {}) {
  const { nodeMap, next, inDegree } = buildGraph(nodes, edges)
  const levels = levelGroup(inDegree, next)
  const results = initialResults
  const conditions = {}
  for (const node of nodes) if (!initialStates[node.id]) onState(node.id, 'waiting')
  for (const level of levels) {
    await Promise.all(level.map(async id => {
      if (signal?.aborted) throw new DOMException('Workflow 已停止', 'AbortError')
      const node = nodeMap[id]
      if (initialStates[id] === 'completed' && results[id]?.status === 'ok') {
        if (node.type === 'condition') conditions[id] = Boolean(results[id].output)
        return
      }
      const incoming = edges.filter(edge => edge.target === id)
      const blocked = incoming.some(edge => nodeMap[edge.source]?.type === 'condition' && conditions[edge.source] !== (edge.sourceHandle !== 'false'))
      if (blocked) { onState(id, 'skipped'); onLog(`跳过 ${node.data?.label || id}`); return }
      onState(id, 'running')
      onLog(`执行 ${node.data?.label || id}`)
      try {
        const inputs = buildInputs(incoming, results)
        const context = createInterpolationContext({ inputs, nodes, results })
        const output = await executeNode({ node, incoming, inputs, context, results, conditions, signal })
        results[id] = { status: 'ok', output: output ?? '' }
        if (node.data) node.data.result = output ?? ''
        onState(id, 'completed')
        onResult(id, results[id])
      } catch (error) {
        results[id] = { status: 'error', output: error.message }
        if (node.data) node.data.result = error.message
        onState(id, 'failed')
        onResult(id, results[id])
        onLog(`失败 ${node.data?.label || id}：${error.message}`)
        if (node.data?.errorPolicy !== 'continue') throw error
      }
    }))
  }
  return results
}
