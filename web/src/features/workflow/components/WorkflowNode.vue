<script setup>
/**
 * 通用工作流节点壳
 *
 * 输入 Handle 由 flex 容器均分布局，handle 的实际 DOM 位置即 edge 端点位置，
 * 无需手动计算 top 百分比。鼠标悬停且所有现有 handle 已被占用时，
 * 额外显示一个 _new 临时 handle（虚线绿色圆圈）。
 */
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { computed, inject, ref, watch, nextTick, onMounted } from 'vue'
import ResizeHandle from './ResizeHandle.vue'
import { useWorkflow } from '../../../lib/contexts.js'

const props = defineProps({
  id:          { type: String, required: true },
  type:        { type: String, required: true },
  label:       { type: String, default: '' },
  data:        Object,
  selected:    Boolean,
  hasInput:    { type: Boolean, default: true },
  hasOutput:   { type: Boolean, default: true },
})

const { updateNodeInternals } = useVueFlow()
const $wfs = useWorkflow()

const edges = inject('wfEdges', [])
const hovering = ref(false)
const tooltipHandle = ref(null)
let longPressTimer = null
let longPressShown = false

function edgeCount() {
  const arr = edges?.value ?? edges ?? []
  return arr.filter(e => e.target === props.id).length
}

const inputCount = computed(() => {
  return Math.max(edgeCount(), 1)
})

const showNewHandle = computed(() => {
  return hovering.value && edgeCount() >= inputCount.value
})

const inputHandles = computed(() => {
  const count = inputCount.value
  const list = Array.from({ length: count }, (_, i) => ({
    id: `in${i}`,
  }))
  if (showNewHandle.value) {
    list.push({ id: '_new' })
  }
  return list
})

const nodeStyle = computed(() => ({
  ...(props.data?._w ? { width: `${props.data._w}px` } : {}),
  ...(props.data?._h ? { height: `${props.data._h}px` } : {}),
}))

const executionStatus = computed(() => $wfs.execStates?.[props.id] || null)
const statusMeta = computed(() => ({
  waiting: { symbol: '○', label: '等待执行' },
  running: { symbol: '◌', label: '正在运行' },
  completed: { symbol: '✓', label: '已完成' },
  failed: { symbol: '×', label: '执行失败' },
  skipped: { symbol: '−', label: '已跳过' },
}[executionStatus.value] || null))

function syncHandles() {
  const node = $wfs.nodes.find(n => n.id === props.id)
  if (node) node.handleBounds = { source: null, target: null }
  nextTick(() => updateNodeInternals(props.id))
}

watch(showNewHandle, syncHandles)
onMounted(syncHandles)

function onMouseMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - r.left
  const y = (e.clientY - r.top) / r.height
  hovering.value = x < 80 && y > 0.4
}

function onMouseLeave() {
  hovering.value = false
}

function handleLabel(handle) {
  const id = handle.id === '_new' ? `in${inputCount.value}` : handle.id
  return id
}

function showTooltip(handle) { tooltipHandle.value = handle.id }
function hideTooltip() { tooltipHandle.value = null }

function startHandlePress(handle, event) {
  if (event.pointerType !== 'touch') return
  longPressShown = false
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    longPressShown = true
    showTooltip(handle)
  }, 450)
}

function endHandlePress() {
  clearTimeout(longPressTimer)
  if (longPressShown) setTimeout(hideTooltip, 1400)
}
</script>

<template>
  <div :class="['wf-node', `wf-${type}`, { selected }]"
    :style="nodeStyle"
    @mousemove="onMouseMove" @mouseleave="onMouseLeave">
    <div v-if="hasInput" class="wf-handle-strip">
      <div v-for="h in inputHandles" :key="h.id" class="wf-input-handle-slot"
        @mouseenter="showTooltip(h)" @mouseleave="hideTooltip"
        @pointerdown="startHandlePress(h, $event)" @pointerup="endHandlePress" @pointercancel="endHandlePress">
        <Handle type="target" :position="Position.Left" :id="h.id"
          :class="['wf-handle', { 'wf-handle-new': h.id === '_new' }]" />
        <span v-if="tooltipHandle === h.id" class="wf-handle-tooltip" role="tooltip">{{ handleLabel(h) }}</span>
      </div>
    </div>
    <Handle v-if="hasOutput" type="source" :position="Position.Right"
      id="out" class="wf-handle" />
    <div class="wf-node-header">
      <slot name="header">{{ label }}</slot>
      <span v-if="statusMeta" class="wf-node-status" :class="`is-${executionStatus}`" :title="statusMeta.label" :aria-label="statusMeta.label">{{ statusMeta.symbol }}</span>
      <span class="wf-node-id">{{ id }}</span>
    </div>
    <div class="wf-node-body">
      <slot />
    </div>
    <ResizeHandle :id="id" :data="data" />
  </div>
</template>

<style>
.wf-node {
  position: relative;
}

.wf-node-status {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  flex: 0 0 16px;
  border: 1px solid currentColor;
  border-radius: 50%;
  font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.wf-node-status.is-waiting { color: var(--text-faint); }
.wf-node-status.is-running { color: var(--accent2); animation: wf-status-spin .8s linear infinite; }
.wf-node-status.is-completed { color: var(--accent2); }
.wf-node-status.is-failed { color: var(--accent); }
.wf-node-status.is-skipped { color: var(--text-faint); }

@keyframes wf-status-spin { to { transform: rotate(360deg); } }

.wf-handle-strip {
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  pointer-events: none;
}

.wf-input-handle-slot {
  position: relative;
  display: flex;
  align-items: center;
  height: 12px;
  pointer-events: none;
}

.wf-input-handle-slot > * { pointer-events: auto; }

.wf-handle-tooltip {
  position: absolute;
  left: 12px;
  z-index: 20;
  padding: 3px 6px;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 3px;
  background: rgba(16, 18, 25, .96);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .3);
  color: var(--text);
  font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  pointer-events: none;
}

.wf-input-handle-slot .vue-flow__handle {
  position: relative !important;
  left: auto !important;
  right: auto !important;
  top: auto !important;
  transform: translateX(-50%) scale(1);
  transform-origin: center;
  pointer-events: auto;
  width: 12px !important;
  height: 12px !important;
  background: rgba(255,255,255,.35) !important;
  border: 2px solid rgba(255,255,255,.55) !important;
  border-radius: 50% !important;
  margin: 0;
  flex-shrink: 0;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.wf-input-handle-slot .vue-flow__handle:hover {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  transform: translateX(-50%) scale(1.5);
}

.wf-node > .vue-flow__handle-right {
  transform: translate(50%, -50%) scale(1);
  transform-origin: center;
  transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.wf-node > .vue-flow__handle-right:hover {
  transform: translate(50%, -50%) scale(1.5);
}

.wf-input-handle-slot .wf-handle-new {
  background: rgba(78,204,163,.25) !important;
  border: 2px dashed rgba(78,204,163,.55) !important;
}

.wf-input-handle-slot .wf-handle-new:hover {
  background: rgba(78,204,163,.5) !important;
  border-color: rgba(78,204,163,.9) !important;
}
</style>
