<script setup>
defineProps({
  active: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'double-click'])
</script>

<template>
  <div class="section-item" :class="{ active, compact }" @click="emit('select')" @dblclick="emit('double-click', $event)">
    <div class="section-item-content"><slot /></div>
    <div v-if="$slots.actions" class="section-item-actions" @click.stop><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.section-item { min-height: 40px; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-left: 3px solid transparent; color: var(--text-dim); cursor: pointer; font-size: 13px; transition: all var(--transition); }
.section-item.compact { min-height: 34px; padding: 5px 16px 5px 20px; border-left: 0; color: var(--text-faint); font-size: 12px; }
.section-item:hover { background: var(--ol-hv); color: var(--text); }
.section-item.active { background: rgba(244,63,94,.08); border-left-color: var(--accent); color: var(--text); font-weight: 500; }
.section-item-content { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.section-item-actions { display: flex; flex-shrink: 0; }
.section-item-actions :deep(button) { opacity: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-sm); background: none; color: var(--text-faint); cursor: pointer; font-size: 14px; transition: all var(--transition); }
.section-item:hover .section-item-actions :deep(button) { opacity: 1; }
.section-item-actions :deep(button:hover) { background: rgba(244,63,94,.15); color: var(--accent); }
@media (max-width: 768px) {
  .section-item { min-height: 48px; padding: 12px 18px; font-size: 14px; }
  .section-item.compact { min-height: 42px; padding: 9px 18px 9px 22px; font-size: 13px; }
  .section-item-actions :deep(button) { opacity: .3; font-size: 16px; padding: 6px; }
}
</style>
