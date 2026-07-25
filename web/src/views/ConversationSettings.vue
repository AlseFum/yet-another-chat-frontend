<script setup>
import { computed, reactive, ref, watch } from 'vue'
import Editor from '../components/Editor.vue'
import Tab from '../components/Tab.vue'
import Button from '../components/Button.vue'
import Icon from '../components/Icon.vue'
import { useWorkspace } from '../lib/contexts.js'
import { clearFragmentConnection, writeFragmentConnection } from '../lib/connection.js'
import { Provider } from '../../../llm/provider.js'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['save', 'open-api-keys'])
const workspace = useWorkspace()

const tab = ref('prompt')
const presetPrompt = ref('')
const draft = reactive({ sysPrompt: '', apiKeyId: '', model: '', temperature: '', maxTokens: '' })
const isCustom = computed(() => presetPrompt.value === '')

watch(() => workspace.activeConv?.id, () => {
  const conversation = workspace.activeConv
  draft.sysPrompt = conversation?.sysPrompt || ''
  draft.apiKeyId = conversation?.apiKeyId || ''
  draft.model = conversation?.model || ''
  draft.temperature = conversation?.temperature || ''
  draft.maxTokens = conversation?.maxTokens || ''
  presetPrompt.value = workspace.presets.find(preset => preset.prompt === draft.sysPrompt)?.prompt || ''
}, { immediate: true })

function saveSystem() {
  emit('save', { sysPrompt: draft.sysPrompt })
}

function selectPreset() {
  if (!presetPrompt.value) return
  draft.sysPrompt = presetPrompt.value
  saveSystem()
}

function saveConfig() {
  emit('save', {
    apiKeyId: draft.apiKeyId,
    model: draft.model,
    temperature: draft.temperature,
    maxTokens: draft.maxTokens,
  })
}

function saveConnection() {
  if (workspace.connection.mode === 'direct') writeFragmentConnection(workspace.connection)
  else clearFragmentConnection()
}
</script>

<template>
  <div v-show="open" id="settings">
    <form @submit.prevent>
      <div class="settings-tabs" role="tablist">
        <Tab :active="tab === 'prompt'" @select="tab = 'prompt'">System</Tab>
        <Tab :active="tab === 'model'" @select="tab = 'model'">连接与模型</Tab>
      </div>

      <template v-if="tab === 'prompt'">
        <div class="setting-row">
          <label>System</label>
          <div class="sp-col">
            <select v-model="presetPrompt" @change="selectPreset">
              <option value="">（自定义）</option>
              <option v-for="preset in workspace.presets" :key="preset.id" :value="preset.prompt">{{ preset.name }}</option>
            </select>
            <div v-if="isCustom" class="sp-col">
              <Editor v-model="draft.sysPrompt" language="markdown" height="100px" />
              <div class="edit-actions"><Button size="sm" @click="saveSystem"><Icon name="check" />保存</Button></div>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <span class="setting-label">生成</span>
          <label class="setting-number">Temp<input v-model="draft.temperature" type="number" step="0.1" min="0" max="2" @change="saveConfig" /></label>
          <label class="setting-number">Max Token<input v-model="draft.maxTokens" type="number" min="1" max="32768" @change="saveConfig" /></label>
        </div>
      </template>
      <template v-else>
        <div class="setting-row">
          <label>连接</label>
          <select v-model="workspace.connection.mode" @change="saveConnection"><option value="proxy">服务端代理</option><option value="direct">浏览器临时直连</option></select>
        </div>
        <template v-if="workspace.connection.mode === 'direct'">
          <div class="setting-row"><label>Schema</label><select v-model="workspace.connection.provider" @change="saveConnection"><option v-for="provider in Provider.list" :key="provider.id" :value="provider.id">{{ provider.label }}</option></select></div>
          <div class="setting-row"><label>URL</label><input v-model="workspace.connection.baseUrl" placeholder="https://api.example.com/v1" @change="saveConnection" /></div>
          <div class="setting-row"><label>临时 Key</label><input v-model="workspace.connection.apiKey" type="password" autocomplete="off" @change="saveConnection" /></div>
          <div class="setting-row"><label>Model</label><input v-model="workspace.connection.model" @change="saveConnection" /></div>
        </template>
        <template v-else>
        <div class="setting-row">
          <label>API Key</label>
          <div class="api-key-control"><select v-model="draft.apiKeyId" @change="saveConfig"><option value="">请选择</option><option v-for="key in workspace.apiKeys" :key="key.id" :value="key.id">{{ key.name }} - {{ key.apiUrl }}</option></select><Button class="api-key-add" variant="ghost" size="icon" title="管理 API Key" @click="emit('open-api-keys')"><Icon name="plus" /></Button></div>
        </div>
        <div class="setting-row">
          <label>Model</label><input v-model="draft.model" @change="saveConfig" />
        </div>
        </template>
      </template>
    </form>
  </div>
</template>
