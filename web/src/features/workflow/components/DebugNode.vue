<script>
import { registerNode } from '../registry.js'

/**
 * Developer extension reference:
 * - Safe to customize: this component, node.data business fields, and the
 *   registerNode() defaults/executor below.
 * - Framework-managed: id, type, position, data._w, data._h, edges,
 *   execution results, and dynamic Handle numbering.
 * - New node types: create a component that calls registerNode(), then import
 *   it in WorkflowView.vue, add it to nodeTypes, and add its toolbar action.
 */
registerNode('debug', {
  defaults: { label: '调试', _w: null, _h: null },
  executor: ({inEdges, results, $wfs}) => {
    $wfs.execLogs.push(`  [调试] ${inEdges.length} 条输入`)
    for (const e of inEdges) {
      const r = results[e.source]
      $wfs.execLogs.push(`    [${e.targetHandle}] ← ${e.source}: ${r ? String(r.output).slice(0, 120) : '(空)'}`)
    }
    return inEdges.length ? (results[inEdges[0].source]?.output || '') : ''
  },
})
</script>

<script setup>
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'
defineProps(['id', 'type', 'data', 'selected'])
</script>

<template>
  <WNode :id="id" type="debug" :label="data.label || '调试'" :data="data" :selected="selected">
    <template #header><Icon name="bug" />{{ data.label || '调试' }}</template>
    <div class="wf-debug-info">打印所有输入，传出第一个</div>
  </WNode>
</template>
