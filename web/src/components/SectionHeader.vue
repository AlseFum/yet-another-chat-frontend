<script setup>
import Icon from './Icon.vue'

defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  borderTop: { type: Boolean, default: false },
  open: { type: Boolean, default: true },
  collapsible: { type: Boolean, default: false },
})
const emit = defineEmits(['activate'])
</script>

<template>
  <div class="section-header" :class="{ compact, 'border-top': borderTop }" @click="emit('activate')">
    <Icon v-if="compact && collapsible" class="section-chevron" :class="{ open }" name="chevron-down" size="14" />
    <span class="section-title"><Icon v-if="icon" :name="icon" size="14" />{{ title }}</span>
    <div v-if="$slots.actions" class="section-actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.section-header { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--ol-bdr-sub); color: var(--text); font-size: 13px; font-weight: 600; letter-spacing: .01em; flex-shrink: 0; }
.section-header.compact { padding: 10px 16px; color: var(--text-dim); font-size: 12px; cursor: pointer; user-select: none; letter-spacing: .02em; }
.section-header.compact:hover { color: var(--text); }
.section-header.border-top { border-top: 1px solid var(--ol-bdr-sub); }
.section-chevron { flex-shrink: 0; transition: transform 0.2s ease; }
.section-header.compact .section-chevron:not(.open) { transform: rotate(-90deg); }
.section-title { display: inline-flex; align-items: center; gap: 6px; }
.section-actions { display: flex; gap: 2px; }
.section-actions :deep(button) { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-dim); cursor: pointer; font-size: 16px; transition: all var(--transition); }
.section-actions :deep(button:hover) { background: var(--ol-btn); color: var(--text); }
</style>
