<script>
import { registerNode } from '../registry.js'

registerNode('input', {
  defaults: { label: '输入', variables: [{ name: 'var1', value: '' }], _w: null, _h: null },
  executor: ({ node }) => Object.fromEntries((node.data.variables || []).map(variable => [String(variable.name || '').trim(), variable.value ?? '']).filter(([name]) => name)),
})
</script>

<script setup>
import { useNodeEdit } from '../shared.js'
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps(['id', 'type', 'data', 'selected'])
const { set } = useNodeEdit(props)

function getVars() { return props.data.variables || [] }
function setVars(list) { set('variables', list) }
function addVar() { setVars([...getVars(), { name: 'var' + (getVars().length + 1), value: '' }]) }
function removeVar(i) { const l = getVars().slice(); l.splice(i, 1); setVars(l) }
function onVarNameChange(i, e) { const l = getVars().slice(); l[i] = { ...l[i], name: e.target.value }; setVars(l) }
function onVarValChange(i, value) { const l = getVars().slice(); l[i] = { ...l[i], value }; setVars(l) }
</script>

<template>
  <WNode :id="id" type="input" :label="data.label || '输入'" :data="data" :selected="selected" :hasInput="false">
    <template #header><Icon name="input" />{{ data.label || '输入' }}</template>
    <div v-for="(v, i) in getVars()" :key="i" class="wf-var-row">
      <input class="wf-var-name nodrag" :value="v.name" @input="onVarNameChange(i, $event)" placeholder="变量名" />
      <input class="wf-var-value nodrag" :value="v.value" @input="onVarValChange(i, $event.target.value)" placeholder="值" />
      <button class="wf-var-del nodrag" @click="removeVar(i)">×</button>
    </div>
    <button class="wf-add-btn nodrag" @click="addVar">+ 变量</button>
  </WNode>
</template>
