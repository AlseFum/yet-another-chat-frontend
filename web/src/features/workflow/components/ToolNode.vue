<script>
import { registerNode } from '../registry.js'
import { interpolateJSON } from '../interpolation.js'

registerNode('tool', {
  defaults: { label: '工具', toolName: '', args: '{}', _w: null, _h: null },
  executor: async ({node, id, context, wfAsyncCall}) => {
    if (!node.data.toolName) return '(未选择工具)'
    const args = node.data.args ? interpolateJSON(node.data.args, context) : {}
    return await wfAsyncCall(id, 'run-tool', { toolName: node.data.toolName, args })
  },
})
</script>

<script setup>
import { inject } from 'vue'
import { useNodeEdit } from '../shared.js'
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps(['id', 'type', 'data', 'selected'])
const tools = inject('wfTools', [])
const { set } = useNodeEdit(props)
</script>

<template>
  <WNode :id="id" type="tool" :label="data.label || '工具调用'" :data="data" :selected="selected">
    <template #header><Icon name="tool" />{{ data.label || '工具调用' }}</template>
    <select class="wf-select nodrag" :value="data.toolName || ''" @change="set('toolName', $event.target.value)">
      <option value="">选择工具...</option>
      <option v-for="t in tools" :key="t.name" :value="t.name">{{ t.name }}</option>
    </select>
    <textarea class="wf-prompt-ta nodrag" :value="data.args || '{}'" @input="set('args', $event.target.value)"
      placeholder='参数 JSON：{{in0}}、{{var.topic}}、{{node.n123}}' rows="2"></textarea>
  </WNode>
</template>
