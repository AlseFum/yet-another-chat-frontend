<script setup>
defineProps({
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])
</script>

<template>
  <button class="tab" :class="{ active }" :disabled="disabled" type="button" role="tab" :aria-selected="active" @click="emit('select')">
    <slot />
  </button>
</template>

<style scoped>
.tab { border: 0; border-bottom: 2px solid transparent; padding: 7px 10px; background: transparent; color: var(--text-dim); cursor: pointer; font: inherit; font-size: 12px; }
.tab:hover:not(:disabled) { color: var(--text); }
.tab.active { color: var(--text); border-bottom-color: var(--accent); }
.tab:disabled { cursor: not-allowed; opacity: .5; }
</style>
