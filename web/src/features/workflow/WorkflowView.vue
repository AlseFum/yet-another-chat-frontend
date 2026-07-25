<script setup>
/**
 * WorkflowView — 工作流编辑器主组件
 *
 * 架构分层：
 *   视觉层 → workflow/*Node.vue         (纯渲染)
 *   Handle → workflow/NodeHandles.vue   (动态入口/出口)
 *   编辑层 → workflow/shared.js         (data 读写)
 *   图管理 → workflow/graph.js          (增删改 + 持久化)
 *   引擎层 → workflow/engine.js         (拓扑排序 + 执行)
 *   状态   → injected workflow runtime context
 */

import { computed, watch, markRaw, provide, ref, nextTick } from 'vue'
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

import InputNode from './components/InputNode.vue'
import PromptNode from './components/PromptNode.vue'
import ToolNode from './components/ToolNode.vue'
import ConditionNode from './components/ConditionNode.vue'
import TextNode from './components/TextNode.vue'
import OutputNode from './components/OutputNode.vue'
import DebugNode from './components/DebugNode.vue'
import MyNode from './components/MyNode.vue'
import Icon from '../../components/Icon.vue'

import { loadWorkflow, onConnect, onEdgesChange, onNodesChange, addNode, clearAll, createDebouncedSave, removeEdge, removeNode } from './graph.js'
import { executeWorkflow } from './engine.js'
import { useWorkflow } from '../../lib/contexts.js'

const props = defineProps({
  workflow:  { type: Object, required: true },
  tools:     { type: Array, default: () => [] },
  texts:     { type: Array, default: () => [] },
  presets:   { type: Array, default: () => [] },
  apiKeys:   { type: Array, default: () => [] },
})
const emit = defineEmits(['save', 'run-prompt', 'run-tool'])
const $wfs = useWorkflow()

const nodeTypes = markRaw({
  input: InputNode, prompt: PromptNode, tool: ToolNode,
  condition: ConditionNode, text: TextNode, output: OutputNode,   debug: DebugNode,
  my: MyNode,
})

provide('wfTools', computed(() => props.tools))
provide('wfTexts', computed(() => props.texts))
provide('wfPresets', computed(() => props.presets))
provide('wfEdges', computed(() => $wfs.edges))

const showWfSettings = ref(true)
const showNodePalette = ref(false)
const vfRef = ref(null)
const canvasRef = ref(null)
const selectedFlowItem = ref(null)
const hasExecutionResults = computed(() => $wfs.execLogs.length > 0 || Object.keys($wfs.execResults).length > 0 || $wfs.nodes.some(node => Object.hasOwn(node.data || {}, 'result')))

const debouncedSave = createDebouncedSave(emit, props,
  () => $wfs.nodes, () => $wfs.edges,
  () => $wfs.execResults, () => $wfs.execLogs)

const onEdgesHandler = changes => {
  onEdgesChange(changes, $wfs.edges)
  if (changes.some(change => change.type === 'remove' && selectedFlowItem.value?.type === 'edge' && selectedFlowItem.value.id === change.id)) selectedFlowItem.value = null
}
const onNodesHandler = changes => {
  onNodesChange(changes, $wfs.nodes, $wfs.edges)
  if (changes.some(change => change.type === 'remove' && selectedFlowItem.value?.type === 'node' && selectedFlowItem.value.id === change.id)) selectedFlowItem.value = null
}

watch(() => props.workflow?.id, () => {
  loadWorkflow(props.workflow, $wfs.nodes, $wfs.edges, $wfs.execResults, $wfs.execLogs)
  $wfs.execStates = {}
}, { immediate: true })

watch([() => $wfs.nodes, () => $wfs.edges], () => debouncedSave(), { deep: true })

function wfAsyncCall(nodeId, type, payload) {
  return new Promise((resolve, reject) => {
    const h = (e) => {
      if (e.detail.nodeId === nodeId) {
        window.removeEventListener('wf-async-result', h)
        e.detail.error ? reject(new Error(e.detail.error)) : resolve(e.detail.result)
      }
    }
    window.addEventListener('wf-async-result', h)
    emit(type, { ...payload, nodeId })
    setTimeout(() => { window.removeEventListener('wf-async-result', h); resolve('(超时)') }, 300000)
  })
}

function runWorkflow() {
  executeWorkflow({ runtime: $wfs, wfAsyncCall, debouncedSave, workflow: props.workflow })
}

function currentFlowCenter() {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return { x: 220, y: 160 }
  const screen = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const flow = vfRef.value
  if (typeof flow?.screenToFlowCoordinate === 'function') return flow.screenToFlowCoordinate(screen)
  if (typeof flow?.project === 'function') return flow.project(screen)
  const viewport = typeof flow?.getViewport === 'function' ? flow.getViewport() : flow?.viewport?.value || flow?.viewport
  if (viewport?.zoom) return { x: (rect.width / 2 - viewport.x) / viewport.zoom, y: (rect.height / 2 - viewport.y) / viewport.zoom }
  return { x: rect.width / 2, y: rect.height / 2 }
}

function addWorkflowNode(type) {
  addNode(type, $wfs.nodes, currentFlowCenter())
  if (window.innerWidth <= 768) showNodePalette.value = false
}

function clearExecutionResults() {
  if ($wfs.executing) return
  $wfs.execResults = {}
  $wfs.execLogs = []
  $wfs.execStates = {}
  for (const node of $wfs.nodes) delete node.data?.result
  debouncedSave()
}

function setWorkflowCredential(event) {
  props.workflow.wfApiKeyId = event.target.value
  debouncedSave()
}

function selectNode({ node }) {
  if (node?.id) selectedFlowItem.value = { type: 'node', id: node.id }
}

function selectEdge({ edge }) {
  if (edge?.id) selectedFlowItem.value = { type: 'edge', id: edge.id }
}

function removeSelectedFlowItem() {
  const item = selectedFlowItem.value
  if (!item || $wfs.executing) return
  if (item.type === 'node') removeNode(item.id, $wfs.nodes, $wfs.edges)
  else removeEdge(item.id, $wfs.edges)
  selectedFlowItem.value = null
  nextTick(() => $wfs.nodes.forEach(node => vfRef.value?.updateNodeInternals?.(node.id)))
}

defineExpose({ executeWorkflow })

// ---- auto-create input handle on drag ----
let _connectSrcId   = null
let _connectHandler = null

function cleanupPendingHandles() {
  for (const n of $wfs.nodes) {
    if (n.data?._pendingNewHandle) n.data._pendingNewHandle = false
  }
}

function onFlowConnectStart({ nodeId, handleType }) {
  if (handleType !== 'source') return
  _connectSrcId = nodeId
  if (_connectHandler) return
  _connectHandler = (e) => {
    for (const n of $wfs.nodes) {
      if (!n.data || n.id === _connectSrcId) continue
      const el = document.querySelector(`[data-id="${n.id}"]`)
      if (!el) { n.data._pendingNewHandle = false; continue }
      const r = el.getBoundingClientRect()
      const near = e.clientX >= r.left - 50 && e.clientX <= r.left + 50
                && e.clientY >= r.top - 10 && e.clientY <= r.bottom + 200
      if (near) {
        // 仅在现有 handle 全被占用时才显示 _new
        const count = n.data._inputCount ?? 1
        const used  = $wfs.edges.filter(ed => ed.target === n.id).length
        n.data._pendingNewHandle = count <= used
      } else {
        n.data._pendingNewHandle = false
      }
    }
  }
  document.addEventListener('mousemove', _connectHandler)
}

function onFlowConnectEnd() {
  _connectSrcId = null
  if (_connectHandler) {
    document.removeEventListener('mousemove', _connectHandler)
    _connectHandler = null
  }
  setTimeout(cleanupPendingHandles, 100)
}
</script>

<template>
  <div class="workflow-view">
    <div class="wf-toolbar">
      <div class="wf-toolbar-group wf-add-node-group">
        <button class="wf-node-palette-toggle" :class="{ open: showNodePalette }" @click="showNodePalette = !showNodePalette"><Icon name="list" />添加节点<Icon name="chevron-down" /></button>
        <div class="wf-node-actions" :class="{ open: showNodePalette }">
          <span class="wf-toolbar-label">添加节点:</span>
          <button class="wf-tb-btn wf-tb-input"     @click="addWorkflowNode('input')"><Icon name="input" />输入</button>
          <button class="wf-tb-btn wf-tb-prompt"    @click="addWorkflowNode('prompt')"><Icon name="robot" />AI</button>
          <button class="wf-tb-btn wf-tb-tool"      @click="addWorkflowNode('tool')"><Icon name="tool" />工具</button>
          <button class="wf-tb-btn wf-tb-condition" @click="addWorkflowNode('condition')"><Icon name="condition" />条件</button>
          <button class="wf-tb-btn wf-tb-text"      @click="addWorkflowNode('text')"><Icon name="file" />文本</button>
          <button class="wf-tb-btn wf-tb-output"    @click="addWorkflowNode('output')"><Icon name="output" />输出</button>
          <button class="wf-tb-btn wf-tb-debug"    @click="addWorkflowNode('debug')"><Icon name="bug" />调试</button>
          <button class="wf-tb-btn"                 @click="addWorkflowNode('my')"><Icon name="sparkles" />自定义</button>
        </div>
      </div>
      <div class="wf-toolbar-group">
        <button class="wf-tb-btn wf-tb-run" :disabled="$wfs.executing" @click="runWorkflow"><Icon name="play" />运行</button>
        <button class="wf-tb-btn wf-tb-clear-results" :disabled="$wfs.executing || !hasExecutionResults" title="清除节点输出与执行日志" @click="clearExecutionResults"><Icon name="trash" />清结果</button>
        <button class="wf-tb-btn wf-tb-clear" @click="clearAll($wfs.nodes, $wfs.edges, $wfs.execResults, $wfs.execLogs)"><Icon name="trash" />清空</button>
        <button class="wf-tb-btn" :class="{ active: showWfSettings }" @click="showWfSettings = !showWfSettings"><Icon name="settings" />设置</button>
        <button class="wf-tb-btn" :class="{ active: $wfs.showResults }" @click="$wfs.showResults = !$wfs.showResults"><Icon name="list" />日志</button>
      </div>
    </div>

    <div v-show="showWfSettings" class="wf-settings">
      <div class="wf-settings-row">
        <label>API Key</label>
        <select :value="workflow.wfApiKeyId || ''" @change="setWorkflowCredential" style="flex:1">
          <option value="">使用当前对话的 API Key</option>
          <option v-for="key in apiKeys" :key="key.id" :value="key.id">{{ key.name }} - {{ key.apiUrl }}</option>
        </select>
        <label>Model</label>
        <input :value="workflow.wfModel || ''" @input="workflow.wfModel = $event.target.value" style="width:140px" placeholder="model" />
        <label>Temp</label>
        <input type="number" step="0.1" min="0" max="2" :value="workflow.wfTemp || ''" @input="workflow.wfTemp = $event.target.value" style="width:60px" placeholder="0.7" />
        <label>MaxTok</label>
        <input type="number" min="1" max="32768" :value="workflow.wfMaxTok || ''" @input="workflow.wfMaxTok = $event.target.value" style="width:70px" placeholder="4096" />
      </div>
    </div>

    <div class="wf-main">
      <div ref="canvasRef" class="wf-canvas">
        <VueFlow
          ref="vfRef"
          v-model:nodes="$wfs.nodes"
          :edges="$wfs.edges"
          :node-types="nodeTypes"
          :default-edge-options="{ type: 'bezier', animated: true }"
          fit-view-on-init
          @edges-change="onEdgesHandler"
          @nodes-change="onNodesHandler"
          @node-click="selectNode"
          @edge-click="selectEdge"
          @pane-click="selectedFlowItem = null"
          @connect="(conn) => { onConnect(conn, $wfs.edges, $wfs.nodes); nextTick(() => { vfRef?.updateNodeInternals?.(conn.source); vfRef?.updateNodeInternals?.(conn.target) }) }"

        >
          <Background :gap="20" pattern-color="rgba(255,255,255,0.04)" />
        </VueFlow>
      </div>
      <div v-if="selectedFlowItem" class="wf-mobile-selection-actions">
        <button type="button" class="wf-mobile-delete" :disabled="$wfs.executing" @click.stop="removeSelectedFlowItem"><Icon name="trash" />{{ selectedFlowItem.type === 'node' ? '删除节点' : '删除连接' }}</button>
        <button type="button" @click.stop="selectedFlowItem = null"><Icon name="close" />取消</button>
      </div>

      <div v-if="$wfs.showResults" class="wf-results">
        <div class="wf-results-header">
          <span><Icon name="list" />执行日志</span>
          <button class="wf-results-close" @click="$wfs.showResults = false"><Icon name="close" /></button>
        </div>
        <div class="wf-results-body">
          <div v-if="!$wfs.execLogs.length" class="wf-results-empty">点击运行执行流程</div>
          <div v-for="(log, i) in $wfs.execLogs" :key="i" class="wf-log-line">{{ log }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-view { display: flex; flex-direction: column; height: 100%; flex: 1; }
.wf-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--glass-panel); backdrop-filter: blur(var(--blur)); border-bottom: 1px solid rgba(255,255,255,.08); flex-shrink: 0; gap: 12px; flex-wrap: wrap; }
.wf-toolbar-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wf-toolbar-label { color: var(--text-dim); font-size: 12px; margin-right: 2px; }
.wf-node-palette-toggle { display: none; }
.wf-node-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wf-tb-btn { background: rgba(15, 52, 96, 0.5); border: 1px solid rgba(255,255,255,.1); color: var(--text); padding: 4px 10px; border-radius: var(--radius); cursor: pointer; font-size: 12px; transition: all .15s; white-space: nowrap; }
.wf-tb-btn:hover { border-color: rgba(255,255,255,.3); }
.wf-tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wf-tb-btn.active { border-color: var(--accent2); color: var(--accent2); }
.wf-tb-input { border-color: rgba(78,204,163,.3); color: var(--accent2); }
.wf-tb-prompt { border-color: rgba(100,149,237,.3); color: #6495ed; }
.wf-tb-tool { border-color: rgba(255,165,0,.3); color: #ffa500; }
.wf-tb-condition { border-color: rgba(255,215,0,.3); color: #ffd700; }
.wf-tb-text { border-color: rgba(186,85,211,.3); color: #ba55d3; }
.wf-tb-output { border-color: rgba(233,69,96,.3); color: var(--accent); }
.wf-tb-run { background: var(--accent2); color: #0a0a1a; border-color: var(--accent2); font-weight: bold; }
.wf-tb-clear-results { color: var(--text-dim); }

.wf-settings {
  background: rgba(24,24,27,.9); border-bottom: 1px solid rgba(255,255,255,.06);
  padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;
}
.wf-settings-row { display: flex; gap: 6px; align-items: center; }
.wf-settings-row label { color: var(--text-dim); font-size: 11px; min-width: 40px; }
.wf-settings-row input {
  background: rgba(39,39,42,.5); border: 1px solid rgba(255,255,255,.08);
  color: var(--text); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 12px;
  font-family: monospace; transition: border-color var(--transition);
}
.wf-settings-row input:focus { border-color: var(--accent); outline: none; }

.wf-main { position: relative; flex: 1; display: flex; min-height: 0; }
.wf-canvas { flex: 1; min-width: 0; }
.wf-mobile-selection-actions { display: none; }
.wf-results { width: 300px; background: rgba(22, 33, 62, 0.9); backdrop-filter: blur(var(--blur)); border-left: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; flex-shrink: 0; }
.wf-results-header { padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 13px; }
.wf-results-close { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 14px; }
.wf-results-body { flex: 1; overflow-y: auto; padding: 8px 12px; font-size: 12px; font-family: monospace; }
.wf-results-empty { color: var(--text-faint); text-align: center; padding: 20px; }
.wf-log-line { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.03); color: #aaa; word-break: break-all; }
.wf-add-btn { background: rgba(255,255,255,.05); border: 1px dashed rgba(255,255,255,.1); color: var(--text-dim); padding: 2px 8px; border-radius: var(--radius); cursor: pointer; font-size: 11px; margin-top: 4px; width: 100%; }
.wf-add-btn:hover { border-color: rgba(255,255,255,.2); color: var(--text); }
:deep(.wf-node) { position: relative; display: flex; flex-direction: column; min-width: 180px; min-height: 76px; overflow: visible; background: rgba(24,27,36,.96); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,.12); border-radius: 7px; color: var(--text); font-size: 13px; box-shadow: 0 8px 20px rgba(0,0,0,.24); transition: border-color .16s ease, box-shadow .16s ease; }
:deep(.wf-node:hover) { border-color: rgba(255,255,255,.24); box-shadow: 0 10px 24px rgba(0,0,0,.32); }
:deep(.wf-node.selected) { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(233,69,96,.2), 0 10px 24px rgba(0,0,0,.36); }
:deep(.wf-node-body) { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 7px; padding: 9px 10px 10px; overflow: auto; }
:deep(.wf-node-header) { display: flex; align-items: center; gap: 7px; min-height: 34px; padding: 7px 10px; border-bottom: 1px solid rgba(255,255,255,.08); border-radius: 6px 6px 0 0; font-size: 12px; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; }
:deep(.wf-node-header .icon) { flex: 0 0 auto; }
:deep(.wf-node-id) { margin-left: auto; color: currentColor; font: 9px ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .55; flex: 0 0 auto; user-select: all; cursor: copy; }
:deep(.wf-input .wf-node-header) { background: rgba(78,204,163,.15); color: var(--accent2); }
:deep(.wf-prompt .wf-node-header) { background: rgba(100,149,237,.15); color: #6495ed; }
:deep(.wf-tool .wf-node-header) { background: rgba(255,165,0,.15); color: #ffa500; }
:deep(.wf-condition .wf-node-header) { background: rgba(255,215,0,.15); color: #ffd700; }
:deep(.wf-text .wf-node-header) { background: rgba(186,85,211,.15); color: #ba55d3; }
:deep(.wf-output .wf-node-header) { background: rgba(233,69,96,.15); color: var(--accent); }
:deep(.wf-debug .wf-node-header) { background: rgba(255,255,255,.06); color: var(--text-dim); }
:deep(.wf-debug-info) { font-size: 11px; color: var(--text-faint); }
:deep(.wf-var-row) { display: grid; grid-template-columns: 72px minmax(0, 1fr) 24px; align-items: stretch; gap: 6px; padding: 0; border: 0; background: transparent; }
:deep(.wf-var-name), :deep(.wf-var-value) { width: 100%; min-width: 0; height: 26px; background: rgba(0,0,0,.16); border: 1px solid rgba(255,255,255,.12); color: var(--text); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-family: monospace; }
:deep(.wf-var-del) { display: grid; width: 24px; min-width: 24px; height: 26px; place-items: center; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--accent); cursor: pointer; font-size: 14px; padding: 0; }
:deep(.wf-var-del:hover) { border-color: rgba(233,69,96,.32); background: rgba(233,69,96,.1); }
:deep(.wf-prompt-ta) { width: 100%; background: rgba(0,0,0,.16); border: 1px solid rgba(255,255,255,.12); color: var(--text); padding: 6px 7px; border-radius: 4px; font-size: 11px; font-family: monospace; resize: vertical; min-height: 36px; }
:deep(.wf-select) { width: 100%; background: rgba(0,0,0,.16); border: 1px solid rgba(255,255,255,.12); color: var(--text); padding: 5px 7px; border-radius: 4px; font-size: 11px; }
:deep(.wf-prompt-ta:focus), :deep(.wf-select:focus), :deep(.wf-var-name:focus), :deep(.wf-var-value:focus) { border-color: currentColor; outline: none; }
:deep(.wf-condition .wf-node-body) { overflow: visible; }
:deep(.wf-node .vue-flow__handle-right) { width: 12px; height: 12px; background: rgba(255,255,255,.35); border: 2px solid rgba(255,255,255,.55); border-radius: 50%; }
:deep(.wf-output-text) { font-size: 12px; color: var(--accent2); word-break: break-all; max-height: 80px; overflow-y: auto; }
:deep(.wf-output-empty) { font-size: 12px; color: var(--text-faint); }
:deep(.wf-handle-true) { top: 40% !important; }
:deep(.wf-handle-false) { top: 60% !important; }
:deep(.wf-handle-label) { position: absolute; right: -2px; font-size: 10px; pointer-events: none; }
:deep(.wf-handle-label-true) { top: calc(40% - 7px); color: var(--accent2); }
:deep(.wf-handle-label-false) { top: calc(60% - 7px); color: var(--accent); }
@media (max-width: 768px) {
  .wf-toolbar { padding: 6px 8px; gap: 6px; }
  .wf-tb-btn { padding: 3px 7px; font-size: 11px; }
  .wf-add-node-group { width: 100%; }
  .wf-node-palette-toggle { display: inline-flex; align-items: center; justify-content: space-between; width: 100%; min-height: 34px; padding: 0 8px; border: 1px solid rgba(255,255,255,.12); border-radius: 5px; background: rgba(15,52,96,.5); color: var(--text-dim); font-size: 12px; }
  .wf-node-palette-toggle .icon:last-child { transition: transform .15s ease; }
  .wf-node-palette-toggle.open .icon:last-child { transform: rotate(180deg); }
  .wf-node-actions { display: none; width: 100%; padding-top: 2px; }
  .wf-node-actions.open { display: flex; }
  .wf-node-actions .wf-toolbar-label { display: none; }
  .wf-results { width: 100%; max-height: 200px; position: absolute; bottom: 0; left: 0; right: 0; border-left: none; border-top: 1px solid rgba(255,255,255,.08); }
  .wf-mobile-selection-actions { position: absolute; z-index: 10; top: 10px; left: 50%; display: flex; gap: 6px; transform: translateX(-50%); padding: 5px; border: 1px solid rgba(255,255,255,.14); border-radius: 6px; background: rgba(24,27,36,.96); box-shadow: 0 8px 20px rgba(0,0,0,.32); }
  .wf-mobile-selection-actions button { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 9px; border: 1px solid rgba(255,255,255,.12); border-radius: 4px; background: transparent; color: var(--text-dim); font-size: 12px; white-space: nowrap; }
  .wf-mobile-selection-actions .wf-mobile-delete { border-color: rgba(233,69,96,.35); color: var(--accent); }
  .wf-mobile-selection-actions button:disabled { opacity: .45; }
  :deep(.wf-node) { min-width: 140px; max-width: 220px; }
}
</style>
