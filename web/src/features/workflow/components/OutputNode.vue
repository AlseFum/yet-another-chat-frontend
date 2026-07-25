<script>
import { registerNode } from '../registry.js'

registerNode('output', {
  defaults: { label: '输出', _w: null, _h: null },
  executor: ({node, id, inEdges, results, inputs, $wfs, wfAsyncCall, workflow})  => {
    console.group(`Output node: ${id}`)
    console.log({ node, id, inEdges, results, inputs, $wfs, wfAsyncCall, workflow })
    console.groupEnd()
    const values = inEdges.map(edge => results[edge.source]?.output).filter(value => value !== undefined)
    if (values.length === 0) return ''
    if (values.length === 1) return values[0]
    return values
  },
})
</script>

<script setup>
import { computed, ref } from 'vue'
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'
import { useWorkflow } from '../../../lib/contexts.js'

const props = defineProps(['id', 'type', 'data', 'selected'])
const $wfs = useWorkflow()
const open = ref(false)

const output = computed(() => $wfs.execResults[props.id]?.output ?? props.data.result ?? '')
const status = computed(() => $wfs.execResults[props.id]?.status || null)

function text(value) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) ?? String(value ?? '') } catch { return String(value) }
}
</script>

<template>
  <WNode :id="id" type="output" :label="data.label || '输出'" :data="data" :selected="selected" :hasOutput="false">
    <template #header><Icon name="output" />{{ data.label || '输出' }}</template>
    <div v-if="output !== ''" class="wf-output-card"><div class="wf-output-card-header"><span>最新输出</span><button class="nodrag" type="button" title="放大查看输出" @click.stop="open = true"><Icon name="expand" size="13" /></button></div><pre class="wf-output-text">{{ text(output) }}</pre></div>
    <div v-else class="wf-output-empty">等待执行...</div>
  </WNode>

  <Teleport to="body">
    <div v-if="open" class="wf-output-modal-backdrop" @click.self="open = false">
      <section class="wf-output-modal" role="dialog" aria-modal="true" :aria-label="`${data.label || '输出'}内容`">
        <header>
          <span><Icon name="output" />{{ data.label || '输出' }}</span>
          <button type="button" title="关闭" @click="open = false"><Icon name="close" /></button>
        </header>
        <pre :class="{ error: status === 'error' }">{{ output === '' ? '暂无输出' : text(output) }}</pre>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.wf-output-modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgba(0, 0, 0, .58); }
.wf-output-modal { width: min(720px, 100%); max-height: min(70vh, 720px); display: flex; flex-direction: column; background: #181b24; border: 1px solid rgba(255,255,255,.18); border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,.45); }
.wf-output-modal header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.1); color: var(--text); font-size: 13px; font-weight: 600; }
.wf-output-modal header span { display: inline-flex; align-items: center; gap: 6px; }
.wf-output-modal header button { border: 0; background: transparent; color: var(--text-dim); cursor: pointer; padding: 4px; }
.wf-output-modal header button:hover { color: var(--text); }
.wf-output-modal pre { margin: 0; padding: 14px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text); font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
.wf-output-modal pre.error { color: #ff8f9c; }
.wf-output-card { display: grid; gap: 5px; padding: 7px 8px; border: 1px solid rgba(233,69,96,.22); border-radius: 5px; background: rgba(233,69,96,.06); }
.wf-output-card-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--text-faint); font-size: 10px; font-weight: 700; }
.wf-output-card-header button { display: grid; width: 24px; height: 24px; place-items: center; border: 1px solid rgba(233,69,96,.24); border-radius: 4px; background: transparent; color: var(--text-faint); cursor: pointer; }
.wf-output-card-header button:hover { border-color: var(--accent); color: var(--accent); background: rgba(233,69,96,.1); }
.wf-output-card .wf-output-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
