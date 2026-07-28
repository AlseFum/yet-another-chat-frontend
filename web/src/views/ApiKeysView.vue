<script setup>
import { computed, reactive, ref } from 'vue'
import AppIcon from '../components/AppIcon.js'
import UiButton from '../components/UiButton.vue'
import UiCombobox from '../components/UiCombobox.vue'
import UiMessage from '../components/UiMessage.vue'
import UiModal from '../components/UiModal.vue'

const props = defineProps({ keys: { type: Array, default: () => [] } })
const selectedId = ref(props.keys.find(key => key.isDefault)?.id || props.keys[0]?.id || '')
const creating = ref(false)
const deleteOpen = ref(false)
const form = reactive({ name: '', schema: 'openai-compatible', endpoint: '', key: '' })
const providerOptions = [
  { value: 'openai-compatible', label: 'OpenAI Compatible', description: 'OpenAI chat completions schema' },
  { value: 'anthropic', label: 'Anthropic', description: 'Anthropic messages schema' },
]
const selected = computed(() => props.keys.find(key => key.id === selectedId.value))
const defaultKey = computed(() => props.keys.find(key => key.isDefault))

function selectKey(id) {
  selectedId.value = id
  creating.value = false
}

function startCreate() {
  Object.assign(form, { name: '', schema: 'openai-compatible', endpoint: '', key: '' })
  creating.value = true
}

function providerLabel(provider) {
  return provider === 'anthropic' ? 'Anthropic' : 'OpenAI Compatible'
}

function credentialMark(key) {
  return (key?.name || 'K').trim().slice(0, 2).toUpperCase()
}
</script>

<template>
  <main class="page keys-view view">
    <header class="page-header credentials-header">
      <div class="page-header__title"><p class="eyebrow">CREDENTIAL VAULT</p><h1>API 凭据</h1><p>集中管理 Workspace 的模型连接。密钥只在创建时写入，之后不再返回浏览器。</p></div>
      <UiButton variant="primary" @click="startCreate"><AppIcon name="plus" />添加凭据</UiButton>
    </header>

    <section class="credential-overview" aria-label="凭据概览">
      <div><span>可用凭据</span><strong>{{ keys.length }}</strong></div>
      <div><span>默认连接</span><strong>{{ defaultKey?.name || '未设置' }}</strong></div>
      <div><span>安全策略</span><strong><AppIcon name="check" size="13" />仅写入</strong></div>
    </section>

    <div class="credentials-layout">
      <aside class="panel credential-index">
        <header><span>连接</span><small>{{ keys.length }} AVAILABLE</small></header>
        <button v-for="key in keys" :key="key.id" :class="{ active: !creating && selectedId === key.id }" @click="selectKey(key.id)">
          <span class="credential-mark">{{ credentialMark(key) }}</span>
          <span class="credential-copy"><strong>{{ key.name }}</strong><small>{{ providerLabel(key.provider) }}</small></span>
          <span v-if="key.isDefault" class="badge positive">默认</span>
          <AppIcon v-else name="chevron" size="12" />
        </button>
        <button class="credential-index__add" :class="{ active: creating }" @click="startCreate"><span class="credential-mark"><AppIcon name="plus" size="14" /></span><span class="credential-copy"><strong>新建连接</strong><small>添加受保护的 API Key</small></span></button>
      </aside>

      <section v-if="creating" class="panel credential-detail credential-create">
        <header class="credential-detail__head"><div class="credential-detail__identity"><span class="credential-mark large"><AppIcon name="key" size="20" /></span><div><p class="eyebrow">NEW CREDENTIAL</p><h2>添加模型连接</h2></div></div><UiButton variant="ghost" size="icon" title="取消" @click="creating = false"><AppIcon name="close" /></UiButton></header>
        <form class="credential-form" @submit.prevent>
          <label><span>显示名称</span><input v-model="form.name" class="field" placeholder="例如：主模型网关" /></label>
          <div class="form-field"><span>Provider schema</span><UiCombobox v-model="form.schema" :options="providerOptions" title="选择 Provider schema" /></div>
          <label class="wide"><span>服务地址</span><input v-model="form.endpoint" class="field" type="url" placeholder="https://api.example.com/v1" /></label>
          <label class="wide"><span>API Key</span><input v-model="form.key" class="field" type="password" autocomplete="new-password" placeholder="仅在此次创建时输入" /></label>
        </form>
        <UiMessage tone="warning" title="密钥不可回读">保存后，前端只保留凭据 ID、Provider 和服务地址。需要变更密钥时，请删除后重新创建。</UiMessage>
        <footer><UiButton variant="ghost" @click="creating = false">取消</UiButton><UiButton variant="primary" :disabled="!form.name || !form.endpoint || !form.key"><AppIcon name="check" />创建凭据</UiButton></footer>
      </section>

      <section v-else-if="selected" class="panel credential-detail">
        <header class="credential-detail__head"><div class="credential-detail__identity"><span class="credential-mark large">{{ credentialMark(selected) }}</span><div><p class="eyebrow">{{ selected.isDefault ? 'DEFAULT CONNECTION' : 'WORKSPACE CONNECTION' }}</p><h2>{{ selected.name }}</h2></div></div><span class="credential-status"><i />可用</span></header>
        <dl class="credential-properties">
          <div><dt>Provider</dt><dd>{{ providerLabel(selected.provider) }}</dd></div>
          <div><dt>Credential ID</dt><dd><code>{{ selected.id }}</code></dd></div>
          <div class="wide"><dt>Endpoint</dt><dd><code>{{ selected.endpoint }}</code></dd></div>
          <div><dt>作用域</dt><dd>当前 Workspace</dd></div>
          <div><dt>密钥状态</dt><dd>已保护 · 不可查看</dd></div>
        </dl>
        <UiMessage tone="info" title="服务端凭据引用">Job 只提交此凭据的 ID，API Key 不会出现在请求快照、事件流或浏览器缓存中。</UiMessage>
        <footer><UiButton v-if="!selected.isDefault"><AppIcon name="check" />设为默认</UiButton><span v-else class="default-note"><AppIcon name="check" />新任务默认使用此连接</span><UiButton variant="danger" @click="deleteOpen = true"><AppIcon name="trash" />删除凭据</UiButton></footer>
      </section>
    </div>

    <UiModal v-model="deleteOpen" title="删除凭据" :description="`将从当前 Workspace 删除 ${selected?.name || '此凭据'}。此操作无法撤销。`" size="sm">
      <UiMessage tone="danger" title="依赖此凭据的任务将无法再次执行">历史 Job 快照仍会保留，但新的调用必须选择其他连接。</UiMessage>
      <template #footer="{ close }"><UiButton variant="ghost" @click="close">取消</UiButton><UiButton variant="danger" @click="close"><AppIcon name="trash" />确认删除</UiButton></template>
    </UiModal>
  </main>
</template>
