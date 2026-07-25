<script setup>
import { reactive, ref } from 'vue'
import Button from '../../components/Button.vue'
import { toast } from '../../components/Toast.vue'

const props = defineProps({ apiKeys: { type: Array, default: () => [] }, generateTalk: { type: Function, required: true } })
const emit = defineEmits(['create', 'back'])
const draft = reactive({ name: '', persona: '', apiKeyId: '', description: '' })
const generating = ref(false)

function create() {
  if (!draft.name.trim() || !draft.persona.trim() || !draft.apiKeyId) return
  emit('create', { name: draft.name, persona: draft.persona, apiKeyId: draft.apiKeyId })
}

async function generate() {
  if (!draft.description.trim()) return toast.info('请先描述你想创建的 Talk')
  if (!draft.apiKeyId) return toast.info('请先选择用于生成的 API Key')
  generating.value = true
  try { await props.generateTalk(draft, draft.description, draft.apiKeyId) } catch (error) { toast.error(`AI 生成 Talk 失败: ${error.message}`) } finally { generating.value = false }
}
</script>

<template>
  <main class="talk-create">
    <div class="talk-create-card">
      <p class="eyebrow">TALK</p>
      <h1>创建一个 Talk</h1>
       <p class="hint">Persona 由你在创建时写入，之后将保持只读。Session 承载角色随后发生的状态、记忆、计划和对话。</p>
        <label>API Key<select v-model="draft.apiKeyId" :disabled="!props.apiKeys.length"><option value="">请选择 Talk 使用的 API Key</option><option v-for="key in props.apiKeys" :key="key.id" :value="key.id">{{ key.name }} - {{ key.apiUrl }}</option></select></label>
        <label>角色设想<textarea v-model="draft.description" placeholder="例如：一位克制、敏锐的深夜电台主持人，会记得与用户的长期对话，但不越界替用户做决定。" rows="4" /></label>
        <div class="generate-row"><p class="hint">AI 会根据角色设想生成名称和 Persona，生成后仍可手动修改。</p><Button :loading="generating" :disabled="!draft.description.trim() || !draft.apiKeyId" @click="generate">AI 生成</Button></div>
        <label>名称<input v-model="draft.name" placeholder="例如：晚间来信" @keydown.enter="create" /></label>
        <label>Persona<textarea v-model="draft.persona" placeholder="描述角色的身份、气质、边界、表达方式与背景。" rows="10" /></label>
       <p v-if="!props.apiKeys.length" class="hint warning">请先在 API Key 管理中创建可用的 API Key。</p>
       <div class="actions"><Button variant="ghost" @click="emit('back')">取消</Button><Button :disabled="!draft.name.trim() || !draft.persona.trim() || !draft.apiKeyId" @click="create">创建 Talk</Button></div>
    </div>
  </main>
</template>

<style scoped>
.talk-create { flex: 1; overflow: auto; padding: 48px 24px; }
.talk-create-card { width: min(100%, 680px); margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.eyebrow { color: var(--accent2); font-size: 11px; font-weight: 700; letter-spacing: .14em; }
h1 { font-size: 24px; letter-spacing: -.03em; }
.hint { color: var(--text-dim); line-height: 1.7; font-size: 13px; }
label { display: flex; flex-direction: column; gap: 7px; color: var(--text-dim); font-size: 12px; font-weight: 600; }
input, textarea, select { width: 100%; border: 1px solid var(--ol-bdr); border-radius: 6px; padding: 10px 12px; background: var(--ol-input); color: var(--text); font: inherit; font-weight: 400; line-height: 1.6; resize: vertical; }
input:focus, textarea:focus, select:focus { border-color: var(--accent2); outline: none; box-shadow: 0 0 0 3px rgba(16,185,129,.12); }
.warning { color: var(--accent); }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.generate-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.generate-row .hint { flex: 1; }
</style>
