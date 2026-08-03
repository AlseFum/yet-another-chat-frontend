<script setup>
import { computed, inject, nextTick, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import AppIcon from '../../../components/AppIcon.js'

const props = defineProps(['id', 'type', 'data', 'selected'])
const application = inject('workflowApplication')
const { updateNodeData, updateNodeInternals } = useVueFlow()
const workflow = computed(() => application.activeWorkflow)
const run = computed(() => workflow.value?.lastRun)
const status = computed(() => run.value?.states?.[props.id])
const output = computed(() => run.value?.results?.[props.id]?.output ?? props.data?.result)
const tools = computed(() => application.tools)
const presets = computed(() => application.presets)
const keys = computed(() => application.workspace?.allKeys() || [])
const inputHandles = computed(() => {
  if (props.type === 'input') return []
  const incoming = workflow.value?.edges?.filter(edge => edge.target === props.id) || []
  const indexes = incoming.map(edge => Number(String(edge.targetHandle || 'in0').replace(/^in/, ''))).filter(Number.isFinite)
  const count = Math.max(incoming.length + 1, indexes.length ? Math.max(...indexes) + 2 : 1)
  return Array.from({ length: count }, (_, index) => `in${index}`)
})
watch(inputHandles, () => nextTick(() => updateNodeInternals(props.id)))
const set = (name, value) => updateNodeData(props.id, { ...props.data, [name]: value })
const setApi = keyRefId => set('api', { ...(props.data.api || {}), keyRefId: keyRefId || null })
const setOption = (name, value) => set('requestOptions', { ...(props.data.requestOptions || {}), [name]: value })
const numberOption = (name, value) => setOption(name, value === '' ? null : Number(value))
const booleanOption = (name, value) => setOption(name, value === '' ? null : value === 'true')
const setVariable = (index, name, value) => { const variables = props.data.variables.map((item, i) => i === index ? { ...item, [name]: value } : item); set('variables', variables) }
const addVariable = () => set('variables', [...(props.data.variables || []), { name: `var${props.data.variables.length + 1}`, value: '' }])
const removeVariable = index => set('variables', props.data.variables.filter((_, i) => i !== index))
const outputText = computed(() => typeof output.value === 'string' ? output.value : output.value === undefined ? '' : JSON.stringify(output.value, null, 2))
const streamText = computed(() => props.data?.streamingText || '')
const streamReasoning = computed(() => props.data?.streamingReasoning || '')
const retry = () => application.retryFrom(props.id).catch(() => {})
</script>

<template>
  <article class="workflow-node" :class="[`workflow-node--${type}`, { selected }]">
    <Handle v-for="(handle, index) in inputHandles" :id="handle" :key="handle" type="target" :position="Position.Left" :style="{ top: `${((index + 1) / (inputHandles.length + 1)) * 100}%` }" />
    <Handle v-if="!['output', 'condition'].includes(type)" type="source" :position="Position.Right" id="out" />
    <Handle v-if="type === 'condition'" class="condition-handle condition-handle--true" type="source" :position="Position.Right" id="true" />
    <Handle v-if="type === 'condition'" class="condition-handle condition-handle--false" type="source" :position="Position.Right" id="false" />
    <header><AppIcon :name="({ input: 'input', text: 'file', prompt: 'robot', tool: 'tool', condition: 'condition', output: 'output' })[type]" /><input class="nodrag" :value="data.label" aria-label="节点名称" @input="set('label', $event.target.value)" /><span v-if="status" :class="`node-status node-status--${status}`" :title="status"></span></header>
    <div class="workflow-node__body nodrag">
      <template v-if="type === 'input'"><div v-for="(variable, index) in data.variables" :key="index" class="workflow-variable"><input :value="variable.name" placeholder="变量" @input="setVariable(index, 'name', $event.target.value)" /><input :value="variable.value" placeholder="值" @input="setVariable(index, 'value', $event.target.value)" /><button title="删除变量" @click="removeVariable(index)"><AppIcon name="close" size="12" /></button></div><button class="node-inline-action" @click="addVariable"><AppIcon name="plus" size="12" />添加变量</button></template>
      <textarea v-else-if="type === 'text'" :value="data.text" placeholder="支持 {{in0}}、{{var.name}}" @input="set('text', $event.target.value)"></textarea>
      <template v-else-if="type === 'prompt'">
        <textarea :value="data.prompt" placeholder="用户 Prompt" @input="set('prompt', $event.target.value)"></textarea>
        <select :value="data.presetId" @change="set('presetId', $event.target.value)"><option value="">自定义 System</option><option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select>
        <textarea :value="data.systemPrompt" placeholder="附加 System Prompt" @input="set('systemPrompt', $event.target.value)"></textarea>
        <details class="workflow-node-api">
          <summary><AppIcon name="key" size="12" />API Config <span>{{ data.api?.keyRefId ? '节点独立' : '继承 Workflow' }}</span></summary>
          <div>
            <label>API Key<select :value="data.api?.keyRefId || ''" @change="setApi($event.target.value)"><option value="">继承 Workflow</option><option v-for="key in keys" :key="key.id" :value="key.id">{{ key.id }} · {{ key.temporary ? '直连' : key.provider }}</option></select></label>
            <label>Model<input :value="data.requestOptions?.model || ''" placeholder="继承 Workflow" @input="setOption('model', $event.target.value)" /></label>
            <div class="workflow-node-api__pair"><label>Temperature<input :value="data.requestOptions?.temperature ?? ''" type="number" min="0" max="2" step="0.1" placeholder="继承" @input="numberOption('temperature', $event.target.value)" /></label><label>Max tokens<input :value="data.requestOptions?.maxTokens ?? ''" type="number" min="1" placeholder="继承" @input="numberOption('maxTokens', $event.target.value)" /></label></div>
            <div class="workflow-node-api__pair"><label>Thinking<select :value="data.requestOptions?.thinking == null ? '' : String(data.requestOptions.thinking)" @change="booleanOption('thinking', $event.target.value)"><option value="">继承</option><option value="true">开启</option><option value="false">关闭</option></select></label><label>Stream<select :value="data.requestOptions?.stream == null ? '' : String(data.requestOptions.stream)" @change="booleanOption('stream', $event.target.value)"><option value="">继承</option><option value="true">开启</option><option value="false">关闭</option></select></label></div>
          </div>
        </details>
        <details class="workflow-node-runtime" :open="Boolean(streamText || streamReasoning)"><summary><AppIcon name="bolt" size="12" />Live output</summary><pre v-if="streamReasoning" class="workflow-node-reasoning">{{ streamReasoning }}</pre><pre v-if="streamText">{{ streamText }}</pre><span v-if="!streamText && !streamReasoning">运行时在这里显示流式输出。</span></details>
      </template>
      <template v-else-if="type === 'tool'"><select :value="data.toolId" @change="set('toolId', $event.target.value)"><option value="">选择 Tool Resource</option><option v-for="tool in tools" :key="tool.id" :value="tool.id">{{ tool.name }}</option></select><textarea :value="data.args" placeholder="参数 JSON" @input="set('args', $event.target.value)"></textarea></template>
      <textarea v-else-if="type === 'condition'" :value="data.condition" placeholder="例如 {{in0}}.length > 10" @input="set('condition', $event.target.value)"></textarea>
      <pre v-else-if="type === 'output'">{{ outputText || '等待流程输出' }}</pre>
      <div v-if="status === 'failed'" class="workflow-node-error-actions"><select :value="data.errorPolicy || 'stop'" @change="set('errorPolicy', $event.target.value)"><option value="stop">失败时停止</option><option value="continue">失败后继续</option></select><button @click="retry"><AppIcon name="play" size="11" />从此节点重试</button></div>
      <label v-if="!['input', 'output', 'tool'].includes(type)" class="workflow-node-error-policy">失败策略<select :value="data.errorPolicy || 'stop'" @change="set('errorPolicy', $event.target.value)"><option value="stop">停止流程</option><option value="continue">继续下游</option></select></label>
      <template v-if="type === 'tool'"><div class="workflow-tool-runtime"><label>超时 ms<input :value="data.timeoutMs || 30000" type="number" min="100" @input="set('timeoutMs', Number($event.target.value) || 30000)" /></label><label>失败策略<select :value="data.errorPolicy || 'stop'" @change="set('errorPolicy', $event.target.value)"><option value="stop">停止流程</option><option value="continue">继续下游</option></select></label></div></template>
    </div>
  </article>
</template>
