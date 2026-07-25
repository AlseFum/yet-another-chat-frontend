<script>
import { reactive } from 'vue'
import Icon from './Icon.vue'

const toastState = reactive([])
let nextId = 1

function show(message, type = 'info', duration = type === 'error' ? 6000 : 3500) {
  const id = nextId++
  toastState.push({ id, message, type })
  if (duration > 0) window.setTimeout(() => dismiss(id), duration)
  return id
}

function dismiss(id) {
  const index = toastState.findIndex(t => t.id === id)
  if (index >= 0) toastState.splice(index, 1)
}

export const toast = {
  show, dismiss,
  info: (m, d) => show(m, 'info', d),
  success: (m, d) => show(m, 'success', d),
  error: (m, d) => show(m, 'error', d),
}

export default {
  setup() {
    const icon = type => ({ success: 'check', error: 'close', info: 'info' })[type] || 'info'
    return { toastState, toast, icon }
  },
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast">
        <div v-for="item in toastState" :key="item.id" class="toast" :class="`toast--${item.type}`" role="status">
          <span class="toast-icon"><Icon :name="icon(item.type)" size="13" /></span>
          <span class="toast-message">{{ item.message }}</span>
          <button class="toast-close" type="button" aria-label="关闭通知" @click="toast.dismiss(item.id)">×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container { position: fixed; z-index: 1000; top: 14px; right: 14px; display: flex; flex-direction: column; gap: 8px; width: min(360px, calc(100vw - 28px)); pointer-events: none; }
.toast { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--ol-btn); border-radius: var(--radius); background: var(--glass-modal); box-shadow: var(--shadow-lg); color: var(--text); font-size: 13px; pointer-events: auto; }
.toast--success { border-color: rgba(16,185,129,.35); }
.toast--error { border-color: rgba(244,63,94,.4); }
.toast-icon { display: flex; flex: 0 0 20px; width: 20px; height: 20px; align-items: center; justify-content: center; border-radius: 50%; background: var(--ol-btn); color: var(--text-dim); font-weight: 700; }
.toast--success .toast-icon { background: rgba(16,185,129,.16); color: var(--accent2); }
.toast--error .toast-icon { background: rgba(244,63,94,.16); color: var(--accent); }
.toast-message { flex: 1; line-height: 1.4; overflow-wrap: anywhere; }
.toast-close { width: 22px; height: 22px; border: 0; border-radius: 4px; background: transparent; color: var(--text-faint); cursor: pointer; font-size: 18px; line-height: 1; }
.toast-close:hover { background: var(--ol-btn); color: var(--text); }
.toast-enter-active, .toast-leave-active { transition: opacity .2s ease, transform .2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(16px); }
@media (max-width: 768px) { .toast-container { top: 8px; right: 8px; width: min(420px, calc(100vw - 16px)); } }
</style>
