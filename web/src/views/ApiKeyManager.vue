<script setup>
import { reactive, ref } from 'vue'
import Card from '../components/Card.vue'
import Button from '../components/Button.vue'
import Icon from '../components/Icon.vue'
import { toast } from '../components/Toast.vue'
import { Provider } from '../../../llm/provider.js'

const props = defineProps({
  apiKeys: { type: Array, default: () => [] },
  createCredential: { type: Function, required: true },
  setDefault: { type: Function, required: true },
})
const emit = defineEmits(['delete', 'back'])

const form = reactive({ name: '', provider: 'openai-compatible', apiUrl: 'https://api.deepseek.com/chat/completions', apiKey: '' })
const saving = ref(false)
const settingDefaultId = ref('')

async function create() {
  if (saving.value) return
  saving.value = true
  try {
    await props.createCredential({ ...form })
    form.name = ''
    form.apiKey = ''
  } catch (e) {
    toast.error(e.message)
  } finally {
    saving.value = false
  }
}

async function setDefault(key) {
  if (key.isDefault || settingDefaultId.value) return
  settingDefaultId.value = key.id
  try { await props.setDefault(key.id) } catch (error) { toast.error(error.message) } finally { settingDefaultId.value = '' }
}
</script>

<template>
  <section class="api-key-manager">
    <header class="manager-header">
      <Button size="sm" @click="emit('back')">← 返回</Button>
      <div>
        <h2>API Key 管理</h2>
        <p>密钥创建后不可查看、复制或修改，只能删除。</p>
      </div>
    </header>

    <Card class="credential-form" padding="18px">
    <form @submit.prevent="create">
      <label>名称<input v-model="form.name" required maxlength="80" placeholder="例如：OpenAI 网关" /></label>
      <label>Schema<select v-model="form.provider"><option v-for="provider in Provider.list" :key="provider.id" :value="provider.id">{{ provider.label }}</option></select></label>
      <label>服务地址<input v-model="form.apiUrl" required type="url" placeholder="https://api.example.com/v1" /></label>
      <label>API Key<input v-model="form.apiKey" required type="password" autocomplete="new-password" placeholder="仅在创建时输入" /></label>
      <div class="form-actions">
        <Button type="submit" size="sm" variant="primary" :loading="saving">{{ saving ? '创建中...' : '创建 API Key' }}</Button>
      </div>
    </form>
    </Card>

    <div class="credential-list">
      <div v-if="!apiKeys.length" class="empty-msg">尚未创建 API Key</div>
      <Card v-for="key in apiKeys" :key="key.id" class="credential-card" padding="14px">
        <div>
          <strong>{{ key.name }}<span v-if="key.isDefault" class="default-badge">默认</span></strong>
          <code>{{ key.apiUrl }}</code>
          <small>{{ key.provider || 'openai-compatible' }} · 创建于 {{ new Date(key.createdAt).toLocaleString() }}</small>
        </div>
        <div class="credential-actions"><Button size="sm" :variant="key.isDefault ? 'primary' : 'ghost'" :loading="settingDefaultId === key.id" :disabled="key.isDefault" @click="setDefault(key)"><Icon name="check" />{{ key.isDefault ? '默认 Key' : '设为默认' }}</Button><Button size="sm" variant="danger" @click="emit('delete', key.id)">删除</Button></div>
      </Card>
    </div>
  </section>
</template>

<style scoped>
.api-key-manager { max-width: 860px; width: 100%; margin: 0 auto; padding: 28px; overflow-y: auto; }
.manager-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 24px; }
h2 { margin: 0; font-size: 20px; }
p { margin: 5px 0 0; color: var(--text-dim); font-size: 13px; }
.credential-form :deep(form) { display: grid; gap: 14px; }
label { display: grid; gap: 6px; color: var(--text-dim); font-size: 12px; }
input, select { width: 100%; background: var(--input-bg); border: 1px solid var(--border); color: var(--text); border-radius: var(--radius-sm); padding: 9px 10px; font: inherit; }
input:focus, select:focus { outline: none; border-color: var(--accent); }
.form-actions { display: flex; align-items: center; gap: 12px; }
.credential-list { display: grid; gap: 10px; margin-top: 22px; }
.credential-card { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.credential-card > div { display: grid; gap: 5px; min-width: 0; }
strong { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }.default-badge { padding: 2px 5px; border-radius: 3px; background: rgba(16,185,129,.12); color: var(--accent2); font-size: 10px; font-weight: 600; }
code, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); font-size: 12px; }
small { color: var(--text-faint); }
.credential-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.danger { color: var(--accent); }
@media (max-width: 768px) { .api-key-manager { padding: 16px; } .credential-card { align-items: flex-start; flex-direction: column; } .credential-actions { width: 100%; justify-content: flex-end; } }
</style>
