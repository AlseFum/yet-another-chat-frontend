<script setup>
defineProps({
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'md' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
})
</script>

<template>
  <button class="button" :class="[`button--${variant}`, `button--${size}`]" :type="type" :disabled="disabled || loading">
    <slot>{{ loading ? '处理中...' : '' }}</slot>
  </button>
</template>

<style scoped>
.button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; font: inherit; line-height: 1; transition: background var(--transition), border-color var(--transition), color var(--transition), opacity var(--transition); }
.button:disabled { cursor: not-allowed; opacity: .55; }
.button--md { min-height: 32px; padding: 0 12px; font-size: 13px; }
.button--sm { min-height: 26px; padding: 0 8px; font-size: 12px; }
.button--icon { width: 32px; min-height: 32px; padding: 0; font-size: 16px; }
.button--ghost { background: transparent; color: var(--text-dim); }
.button--ghost:hover:not(:disabled) { background: var(--ol-btn); color: var(--text); }
.button--secondary { background: var(--ol-btn); border-color: var(--ol-bdr); color: var(--text); }
.button--secondary:hover:not(:disabled) { background: var(--ol-hv); border-color: var(--ol-sb); }
.button--primary { background: var(--accent); color: #fff; }
.button--primary:hover:not(:disabled) { filter: brightness(1.1); }
.button--danger { background: transparent; border-color: rgba(244,63,94,.25); color: var(--accent); }
.button--danger:hover:not(:disabled) { background: rgba(244,63,94,.12); }
</style>
