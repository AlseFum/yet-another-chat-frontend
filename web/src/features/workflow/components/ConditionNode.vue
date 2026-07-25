<script>
import { registerNode } from '../registry.js'
import { evaluateCondition } from '../interpolation.js'

registerNode('condition', {
  defaults: { label: '条件', condition: '', _w: null, _h: null },
  executor: ({node, context, condResults, $wfs}) => {
    let val = false
    try {
      val = evaluateCondition(node.data.condition || '', context)
    } catch {}
    condResults[node.id] = val
    $wfs.execLogs.push(`  [条件] 结果: ${val}`)
    return String(val)
  },
})
</script>

<script setup>
import { Handle, Position } from '@vue-flow/core'
import { useNodeEdit } from '../shared.js'
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps(['id', 'type', 'data', 'selected'])
const { set } = useNodeEdit(props)
</script>

<template>
  <WNode :id="id" type="condition" :label="data.label || '条件'" :data="data" :selected="selected" :hasOutput="false">
    <template #header><Icon name="condition" />{{ data.label || '条件' }}</template>
    <textarea class="wf-prompt-ta nodrag" :value="data.condition || ''" @input="set('condition', $event.target.value)"
      placeholder="例如 {{in0}}.length > 100" rows="2"></textarea>
    <Handle type="source" :position="Position.Right" id="true" :style="{ top: '35%' }" />
    <div class="wf-handle-label wf-handle-label-true"><Icon name="check" size="11" /></div>
    <Handle type="source" :position="Position.Right" id="false" :style="{ top: '65%' }" />
    <div class="wf-handle-label wf-handle-label-false"><Icon name="close" size="11" /></div>
  </WNode>
</template>
