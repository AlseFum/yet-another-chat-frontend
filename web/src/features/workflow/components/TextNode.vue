<script>
import { registerNode } from '../registry.js'
import { interpolateText } from '../interpolation.js'

registerNode('text', {
  defaults: { label: '文本', text: '', _w: null, _h: null },
  executor: ({ node, context }) => interpolateText(node.data.text || '', context)
})
</script>

<script setup>
import { useNodeEdit } from '../shared.js'
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps(['id', 'type', 'data', 'selected'])
const { set } = useNodeEdit(props)
</script>

<template>
  <WNode :id="id" type="text" :label="data.label || '文本'" :data="data" :selected="selected">
    <template #header><Icon name="file" />{{ data.label || '文本' }}</template>
    <textarea class="wf-prompt-ta nodrag" :value="data.text || ''" @input="set('text', $event.target.value)"
      placeholder="{{in0}}、{{var.topic}}、{{node.n123}}" rows="2"></textarea>
  </WNode>
</template>
