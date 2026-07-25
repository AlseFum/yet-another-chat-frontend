<script setup>
import { ref } from 'vue'
import { useVueFlow } from '@vue-flow/core'

const props = defineProps(['id', 'data'])
const { updateNodeData } = useVueFlow()
const resizing = ref(false)

let nodeLeft = 0, nodeTop = 0, offsetX = 0, offsetY = 0

function onDown(e) {
  e.stopImmediatePropagation()
  e.preventDefault()
  resizing.value = true
  const el = e.target.closest('.wf-node')
  const r = el.getBoundingClientRect()
  // 缓存 mousedown 瞬间的节点位置，整个 resize 过程不变
  nodeLeft = r.left
  nodeTop  = r.top
  offsetX  = r.right  - e.clientX
  offsetY  = r.bottom - e.clientY
  window.addEventListener('mousemove', move, { passive: true })
  window.addEventListener('mouseup', up)
}

function move(e) {
  const w = Math.max(160, Math.round(e.clientX - nodeLeft + offsetX))
  const h = Math.max(60,  Math.round(e.clientY - nodeTop  + offsetY))
  updateNodeData(props.id, { ...props.data, _w: w, _h: h })
}

function up() {
  resizing.value = false
  window.removeEventListener('mousemove', move)
  window.removeEventListener('mouseup', up)
}
</script>

<template>
  <div class="nodrag wf-resize-handle" :class="{ active: resizing }" @mousedown.capture="onDown">
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M0 10 L10 10 L10 0" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="1.5"/>
    </svg>
  </div>
</template>

<style scoped>
.wf-resize-handle {
  position: absolute; bottom: 1px; right: 1px;
  cursor: nwse-resize; padding: 3px; z-index: 10;
  display: flex; align-items: flex-end; justify-content: flex-end;
  opacity: 0.4; transition: opacity .15s;
}
.wf-resize-handle:hover, .wf-resize-handle.active { opacity: 1; }
</style>
