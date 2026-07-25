<script setup>
import { computed, ref, watch } from 'vue'
import Button from './Button.vue'
import Editor from './Editor.vue'

const props = defineProps({
  text: { type: [String, Number], default: '' },
  collapsible: Boolean,
  open: Boolean,
  label: { type: String, default: '' },
  caption: { type: String, default: '' },
})
const formatted = ref(false)

const parsed = computed(() => {
  const text = String(props.text ?? '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(text) } catch { return null }
})
const json = computed(() => parsed.value === null ? null : JSON.stringify(parsed.value, null, 2))

watch(() => props.text, () => { formatted.value = false })
</script>

<template>
  <details v-if="collapsible" class="json-code-block json-fold" :open="open">
    <summary><strong>{{ label }}</strong><span v-if="caption">{{ caption }}</span><Button v-if="json" size="sm" variant="ghost" @click.prevent.stop="formatted = !formatted">{{ formatted ? '原始文本' : '格式化 JSON' }}</Button></summary>
    <Editor v-if="formatted && json" :model-value="json" language="json" read-only compact />
    <pre v-else>{{ text }}</pre>
  </details>
  <div v-else class="json-code-block">
    <div v-if="json" class="json-code-actions"><Button size="sm" variant="ghost" @click="formatted = !formatted">{{ formatted ? '原始文本' : '格式化 JSON' }}</Button></div>
    <Editor v-if="formatted && json" :model-value="json" language="json" read-only compact />
    <pre v-else>{{ text }}</pre>
  </div>
</template>

<style scoped>
.json-code-block { position: relative; }
.json-code-actions { display: flex; justify-content: flex-end; margin: 0 0 4px; }
.json-code-actions :deep(button) { min-height: 24px; font-size: 11px; }
.json-fold > summary { display: flex; align-items: center; min-height: 32px; gap: 8px; padding: 7px 10px; cursor: pointer; background: var(--glass-msg-assist); color: var(--text-dim); font-size: 11px; }
.json-fold > summary::-webkit-details-marker { display: none; }
.json-fold > summary::marker { content: ''; }
.json-fold > summary::after { content: '+'; display: grid; width: 16px; height: 16px; flex: 0 0 16px; place-items: center; border: 1px solid var(--border); border-radius: 3px; color: var(--text-faint); font: 14px/1 ui-monospace, monospace; }
.json-fold[open] > summary::after { content: '-'; color: var(--text); }
.json-fold > summary > span { margin-right: auto; color: var(--text-faint); font-size: 10px; }
.json-fold > summary :deep(button) { min-height: 24px; font-size: 11px; }
.json-code-block pre { max-height: 330px; overflow: auto; margin: 0; padding: 12px; border-radius: 5px; background: var(--input-bg); color: var(--text-dim); white-space: pre-wrap; word-break: break-word; font-size: 11px; }
.json-fold > pre { border-radius: 0; background: transparent; }
.json-code-block :deep(.editor) { border-radius: 5px; }
.json-code-block :deep(.editor.compact) { background: var(--input-bg); }

@media (max-width: 760px) {
  .json-code-block pre { max-height: 48vh; padding: 10px; font-size: 12px; }
}
</style>
