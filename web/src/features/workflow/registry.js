/**
 * 节点注册表
 * ==========
 * 所有节点类型必须在这里注册，注册后引擎和画布自动识别。
 * 每个 .vue 组件通过 <script>（非 setup）块调用 registerNode。
 *
 * Executor 入参:
 *   ctx.nodes      - 当前所有节点数组
 *   ctx.edges      - 当前所有边数组
 *   ctx.inEdges    - 指向本节点的入边 [{ source, sourceHandle, targetHandle }]
 *   ctx.portCtx    - 端口上下文 { handleName: 上游output, ..., _inputs: InputNode变量 }
 *   ctx.node       - 本节点对象 { id, type, data }
 *   ctx.execResults- 执行结果字典 { nodeId: { output, status } }
 *   ctx.inputs     - InputNode 变量对象 { varName: value }
 *   ctx.condResults- 条件节点结果 { nodeId: boolean }
 *   ctx.wfAsyncCall- (id, type, payload) => Promise<string> 异步桥接
 *   ctx.workflow   - 工作流对象（含 wfApiKeyId / wfModel 等）
 *   ctx.$wfs       - 工作流本地状态 { executing, execLogs, execResults }
 *
 * @returns {string | Promise<string>} 节点输出（非 prompt 类型返回纯字符串，prompt 类型返回 Promise）
 */

const nodes = Object.create(null)

export function registerNode(type, { defaults, executor }) {
  nodes[type] = { defaults: defaults || {}, executor }
}

export function getExecutor(type) { return nodes[type]?.executor }

export function getDefaults(type) { return nodes[type]?.defaults || {} }

export function getTypes() { return Object.keys(nodes) }
