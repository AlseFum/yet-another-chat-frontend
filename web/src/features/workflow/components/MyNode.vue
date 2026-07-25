<script>
import { registerNode } from '../registry.js'

registerNode('my', {
  defaults: { label: '自定义', _w: null, _h: null },
  executor: ({inEdges, results, $wfs, inputs}) => {
    $wfs.execLogs.push(`  My: ${inEdges.length} 条输入, inputs: ${JSON.stringify(inputs)}`)
    return 42
  },
})
</script>

<script setup>
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'
defineProps(['id', 'type', 'data', 'selected'])
</script>

<template>
  <WNode :id="id" type="my" :label="data.label || '自定义'" :data="data" :selected="selected">
    <template #header><Icon name="sparkles" />{{ data.label || '自定义' }}</template>
    <div class="wf-debug-info">测试节点</div>
  </WNode>
</template>
