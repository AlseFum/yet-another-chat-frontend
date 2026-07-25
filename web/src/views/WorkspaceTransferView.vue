<script setup>
import { ref } from 'vue'
import Button from '../components/Button.vue'
import { toast } from '../components/Toast.vue'
import { apiExportWorkspace, apiImportWorkspace } from '../lib/api.js'

defineProps({ workspace: { type: String, required: true } })
const emit = defineEmits(['back', 'imported'])
const file = ref(null)
const data = ref(null)
const busy = ref(false)

async function exportWorkspace() {
  busy.value = true
  try {
    const bundle = await apiExportWorkspace()
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${bundle.workspace}-workspace.json`; link.click()
    URL.revokeObjectURL(url)
  } catch (cause) { toast.error(cause.message) } finally { busy.value = false }
}

async function readFile(event) {
  data.value = null
  const selected = event.target.files?.[0]
  if (!selected) return
  file.value = selected
  try {
    const parsed = JSON.parse(await selected.text())
    if (!parsed?.resources || typeof parsed.resources !== 'object') throw new Error('不是有效的 workspace 导出文件')
    data.value = parsed
  } catch (cause) { toast.error(cause.message) }
}

async function importWorkspace() {
  if (!data.value || !confirm('导入会覆盖当前 workspace 的对话、Talk、文本、工具、预设和工作流。继续吗？')) return
  busy.value = true
  try { await apiImportWorkspace(data.value); emit('imported') } catch (cause) { toast.error(cause.message) } finally { busy.value = false }
}
</script>

<template>
  <main class="transfer-view">
    <header><div><p>WORKSPACE</p><h1>导入与导出</h1><span>{{ workspace }}</span></div><Button size="sm" @click="emit('back')">返回</Button></header>
    <section><h2>导出</h2><p>导出对话、Talk、文本、工具、预设和工作流。API Key 与 LLM Job 历史不会包含在文件中。</p><Button variant="primary" :loading="busy" @click="exportWorkspace">导出 Workspace</Button></section>
    <section><h2>导入</h2><p>导入会覆盖当前 workspace 的可转移资源。导入后请重新配置 API Key。</p><input type="file" accept="application/json,.json" @change="readFile" />
      <p v-if="data" class="ready">已选择 {{ file?.name }}，包含 {{ Object.keys(data.resources).length }} 类资源。</p>
      <Button variant="danger" :disabled="!data" :loading="busy" @click="importWorkspace">导入并覆盖当前 Workspace</Button>
    </section>
  </main>
</template>

<style scoped>
  .transfer-view { flex: 1; overflow: auto; padding: 28px clamp(16px, 4vw, 48px); }.transfer-view > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 26px; }.transfer-view header p { margin: 0 0 4px; color: var(--accent2); font-size: 10px; font-weight: 700; letter-spacing: .14em; }.transfer-view h1 { margin: 0; font-size: 24px; }.transfer-view header span { color: var(--text-faint); font-size: 12px; }.transfer-view section { max-width: 700px; margin-top: 14px; padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--glass-panel); }.transfer-view h2 { margin: 0; font-size: 15px; }.transfer-view section p { margin: 8px 0 14px; color: var(--text-dim); font-size: 13px; line-height: 1.6; }.transfer-view input { display: block; margin: 14px 0; color: var(--text-dim); }.ready { color: var(--accent2) !important; }
</style>
