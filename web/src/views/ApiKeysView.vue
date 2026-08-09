<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.js'
import UiButton from '../components/UiButton.vue'
import UiCombobox from '../components/UiCombobox.vue'
import UiMessage from '../components/UiMessage.vue'
import UiModal from '../components/UiModal.vue'
import UiSwitch from '../components/UiSwitch.vue'
import { Provider } from '../../../llm/index.js'

const props = defineProps({
  keys: { type: Array, default: () => [] },
  selectedKeyId: { type: String, default: '' },
  createKey: { type: Function, required: true },
  createTemporaryKey: { type: Function, required: true },
  deleteKey: { type: Function, required: true },
  selectKey: { type: Function, required: true },
  error: { type: String, default: '' },
})
const selectedId = ref(props.selectedKeyId || props.keys[0]?.id || '')
const creating = ref(false)
const deleteOpen = ref(false)
const saving = ref(false)
const actionError = ref('')
const defaultProvider = Provider.list.find(provider => provider.id === 'deepseek') || Provider.list[0]
const form = reactive({ id: '', provider: defaultProvider.id, baseUrl: defaultProvider.defaultBaseUrl, apiKey: '', temporary: false })
const providerOptions = Provider.list.map(provider => ({
  value: provider.id,
  label: provider.label,
  description: [provider.defaultBaseUrl, provider.defaultModels.join(', ')].filter(Boolean).join(' - '),
}))
const selected = computed(() => props.keys.find(key => key.id === selectedId.value))
const selectedKey = computed(() => props.keys.find(key => key.id === props.selectedKeyId))
const selectedProvider = computed(() => Provider.list.find(provider => provider.id === form.provider) || defaultProvider)
const requiresApiKey = computed(() => selectedProvider.value.requiresApiKey)

watch(() => props.selectedKeyId, id => { if (id) selectedId.value = id })
watch(() => props.keys, keys => { if (!keys.some(key => key.id === selectedId.value)) selectedId.value = keys[0]?.id || '' }, { deep: true })
watch(() => form.provider, providerId => {
  form.baseUrl = Provider.get(providerId).defaultBaseUrl
  form.apiKey = ''
})

function selectCredential(id) {
  selectedId.value = id
  creating.value = false
  actionError.value = ''
}

function startCreate() {
  Object.assign(form, { id: '', provider: defaultProvider.id, baseUrl: defaultProvider.defaultBaseUrl, apiKey: '', temporary: false })
  actionError.value = ''
  creating.value = true
}

function providerLabel(provider) { return Provider.get(provider).label }
function credentialMark(key) { return (key?.id || 'K').trim().slice(0, 2).toUpperCase() }

async function submitCreate() {
  if (saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    const create = form.temporary ? props.createTemporaryKey : props.createKey
    const key = await create({ id: form.id, provider: form.provider, baseUrl: form.baseUrl, apiKey: form.apiKey })
    selectedId.value = key.id
    creating.value = false
    form.apiKey = ''
  } catch (error) { actionError.value = error.message } finally { saving.value = false }
}

async function makeDefault() {
  if (!selected.value || saving.value) return
  saving.value = true
  actionError.value = ''
  try { await props.selectKey(selected.value.id) } catch (error) { actionError.value = error.message } finally { saving.value = false }
}

async function confirmDelete() {
  if (!selected.value || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    await props.deleteKey(selected.value.id, selected.value.temporary === true)
    deleteOpen.value = false
  } catch (error) { actionError.value = error.message } finally { saving.value = false }
}
</script>

<template>
  <main class="page keys-view view">
    <header class="page-header credentials-header"><div class="page-header__title"><p class="eyebrow">CREDENTIAL VAULT</p><h1>API 凭据</h1><p>密钥只在创建时发送到服务端。浏览器随后仅持有 KeyRef，不保留明文 API Key。</p></div><UiButton variant="primary" @click="startCreate"><AppIcon name="plus" />添加凭据</UiButton></header>
    <UiMessage v-if="error" tone="danger" title="后端不可用">{{ error }}</UiMessage>

    <section class="credential-overview" aria-label="凭据概览"><div><span>可用凭据</span><strong>{{ keys.length }}</strong></div><div><span>当前连接</span><strong>{{ selectedKey?.id || '未选择' }}</strong></div><div><span>执行位置</span><strong><AppIcon name="check" size="13" />{{ selectedKey?.temporary ? '浏览器直连' : '服务端托管' }}</strong></div></section>

    <div class="credentials-layout">
      <aside class="panel credential-index"><header><span>连接</span><small>{{ keys.length }} AVAILABLE</small></header><button v-for="key in keys" :key="key.id" :class="{ active: !creating && selectedId === key.id }" @click="selectCredential(key.id)"><span class="credential-mark">{{ credentialMark(key) }}</span><span class="credential-copy"><strong>{{ key.id }}</strong><small>{{ providerLabel(key.provider) }}</small></span><span v-if="key.id === selectedKeyId" class="badge positive">当前</span><AppIcon v-else name="chevron" size="12" /></button><button class="credential-index__add" :class="{ active: creating }" @click="startCreate"><span class="credential-mark"><AppIcon name="plus" size="14" /></span><span class="credential-copy"><strong>新建连接</strong><small>添加受保护的 API Key</small></span></button></aside>

      <section v-if="creating" class="panel credential-detail credential-create"><header class="credential-detail__head"><div class="credential-detail__identity"><span class="credential-mark large"><AppIcon name="key" size="20" /></span><div><p class="eyebrow">NEW CREDENTIAL</p><h2>添加模型连接</h2></div></div><UiButton variant="ghost" size="icon" title="取消" @click="creating = false"><AppIcon name="close" /></UiButton></header><form class="credential-form" @submit.prevent="submitCreate"><label><span>Key ID</span><input v-model="form.id" class="field" pattern="[A-Za-z0-9_\\-]+" autocomplete="off" placeholder="例如：primary_gateway" /></label><div class="form-field"><span>Provider schema</span><UiCombobox v-model="form.provider" :options="providerOptions" title="选择 Provider schema" /></div><label class="wide"><span>Base URL</span><input v-model="form.baseUrl" class="field" type="url" autocomplete="url" placeholder="https://api.example.com/v1" /></label><label v-if="requiresApiKey" class="wide"><span>API Key</span><input v-model="form.apiKey" class="field" type="password" autocomplete="new-password" placeholder="仅在此次创建时输入" /></label><UiSwitch v-model="form.temporary" class="wide" label="仅本次会话使用" description="不保存到服务端，由浏览器直接向 Provider 发起 Job" /></form><UiMessage :tone="form.temporary ? 'info' : 'warning'" :title="form.temporary ? '临时明文仅保存在内存' : '密钥不可回读'">{{ form.temporary ? '刷新或关闭页面后立即丢失。受 Provider CORS 策略限制。' : requiresApiKey ? '保存后仅能查看 ID、Provider 与 Base URL。更换密钥需要删除后重新创建。' : '该 Provider 不需要 API Key。' }}</UiMessage><UiMessage v-if="actionError" tone="danger" title="操作失败">{{ actionError }}</UiMessage><footer><UiButton variant="ghost" @click="creating = false">取消</UiButton><UiButton variant="primary" :disabled="saving || !form.id || !form.baseUrl || (requiresApiKey && !form.apiKey)" @click="submitCreate"><AppIcon name="check" />{{ saving ? '创建中' : form.temporary ? '使用临时凭据' : '创建凭据' }}</UiButton></footer></section>

      <section v-else-if="selected" class="panel credential-detail"><header class="credential-detail__head"><div class="credential-detail__identity"><span class="credential-mark large">{{ credentialMark(selected) }}</span><div><p class="eyebrow">{{ selected.id === selectedKeyId ? 'ACTIVE CONNECTION' : selected.temporary ? 'TEMPORARY CONNECTION' : 'SERVER CONNECTION' }}</p><h2>{{ selected.id }}</h2></div></div><span class="credential-status"><i />可用</span></header><dl class="credential-properties"><div><dt>Provider</dt><dd>{{ providerLabel(selected.provider) }}</dd></div><div><dt>KeyRef</dt><dd><code>{{ selected.temporary ? 'temporary' : 'server' }}:{{ selected.id }}</code></dd></div><div class="wide"><dt>Base URL</dt><dd><code>{{ selected.baseUrl }}</code></dd></div><div><dt>作用域</dt><dd>{{ selected.temporary ? '浏览器内存' : '当前 Workspace' }}</dd></div><div><dt>密钥状态</dt><dd>{{ selected.temporary ? '明文内存 · 页面关闭即丢失' : '服务端保护 · 不可查看' }}</dd></div></dl><UiMessage tone="info" :title="selected.temporary ? '临时 KeyRef' : '服务端 KeyRef'">{{ selected.temporary ? 'Job 在浏览器中直接执行，凭据不会发送到本项目后端。' : 'Job 只提交 keyId。API Key 不会出现在 Job 快照、SSE 或浏览器状态中。' }}</UiMessage><UiMessage v-if="actionError" tone="danger" title="操作失败">{{ actionError }}</UiMessage><footer><UiButton v-if="selected.id !== selectedKeyId && !selected.temporary" :disabled="saving" @click="makeDefault"><AppIcon name="check" />设为当前</UiButton><span v-else class="default-note"><AppIcon name="check" />新 Job 默认使用此连接</span><UiButton variant="danger" :disabled="saving" @click="deleteOpen = true"><AppIcon name="trash" />{{ selected.temporary ? '清除临时凭据' : '删除凭据' }}</UiButton></footer></section>
    </div>

    <UiModal v-model="deleteOpen" :title="selected?.temporary ? '清除临时凭据' : '删除凭据'" :description="selected?.temporary ? `${selected?.id || '此凭据'} 将从浏览器内存中立即清除。` : `将从当前 Workspace 删除 ${selected?.id || '此凭据'}。此操作无法撤销。`" size="sm"><UiMessage tone="danger" title="依赖此凭据的 Job 将无法再次执行">历史 Job 快照仍会保留，但新的调用必须选择其他 KeyRef。</UiMessage><template #footer="{ close }"><UiButton variant="ghost" @click="close">取消</UiButton><UiButton variant="danger" :disabled="saving" @click="confirmDelete"><AppIcon name="trash" />确认</UiButton></template></UiModal>
  </main>
</template>
