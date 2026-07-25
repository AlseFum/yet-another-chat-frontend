<script>
import { registerNode } from '../registry.js'
import { interpolateText } from '../interpolation.js'

registerNode('prompt', {
  defaults: { label: 'AI 对话', prompt: '', sysPrompt: '', presetId: '', _w: null, _h: null },
  executor: async ({node, id, context, $wfs, wfAsyncCall, workflow}) => {
    const prompt = interpolateText(node.data.prompt || '', context)
    if (!prompt.trim()) return '(空提示词)'
    $wfs.execLogs.push(`  [提示词] ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`)
    return await wfAsyncCall(id, 'run-prompt', {
      prompt,
      sysPrompt:    interpolateText(node.data.sysPrompt || '', context) || undefined,
      temperature:  node.data.temperature || 0.8,
      maxTokens:    node.data.maxTokens || 800,
       apiKeyId:     workflow?.wfApiKeyId,
      model:        workflow?.wfModel,
      wfTemp:       workflow?.wfTemp,
      wfMaxTok:     workflow?.wfMaxTok,
    })
  },
})
</script>

<script setup>
import { ref, computed, inject } from 'vue'
import { useNodeEdit } from '../shared.js'
import WNode from './WorkflowNode.vue'
import Icon from '../../../components/Icon.vue'

const props = defineProps(['id', 'type', 'data', 'selected'])
const { set, setAll } = useNodeEdit(props)
const presets = inject('wfPresets', [])
const showSys = ref(false)
const pArr = computed(() => presets.value ?? presets)

function onPresetChange(e) {
  const p = pArr.value.find(x => x.id === e.target.value)
  setAll({ presetId: e.target.value, sysPrompt: p ? p.prompt : (props.data.sysPrompt || ''), temperature: p?.temperature || '', maxTokens: p?.maxTokens || '' })
}
</script>

<template>
  <WNode :id="id" type="prompt" :label="data.label || 'AI 对话'" :data="data" :selected="selected">
    <template #header><Icon name="robot" />{{ data.label || 'AI 对话' }}</template>
    <textarea class="wf-prompt-ta nodrag" :value="data.prompt || ''" @input="set('prompt', $event.target.value)"
      placeholder="{{in0}}、{{var.topic}}、{{node.n123}}" rows="3"></textarea>
    <button class="wf-sys-toggle nodrag" @click="showSys = !showSys"><Icon v-if="!showSys" name="settings" />{{ showSys ? '收起' : 'System' }}</button>
    <template v-if="showSys">
      <select class="wf-select nodrag" :value="data.presetId || ''" @change="onPresetChange">
        <option value="">（自定义）</option>
        <option v-for="p in pArr" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <textarea class="wf-prompt-ta nodrag" :value="data.sysPrompt || ''" @input="set('sysPrompt', $event.target.value)"
        placeholder="System prompt（可通过上方预设选择）" rows="2"></textarea>
    </template>
  </WNode>
</template>
