<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.js'
import UiButton from './UiButton.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  size: { type: String, default: 'md' },
  closeOnBackdrop: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue', 'close'])
const titleId = useId()
const panel = ref(null)
let previousOverflow = ''
let previousFocus = null

function close() {
  emit('update:modelValue', false)
  emit('close')
}

function handleBackdrop() {
  if (props.closeOnBackdrop) close()
}

function handleKeydown(event) {
  if (event.key === 'Escape') return close()
  if (event.key !== 'Tab') return
  const focusable = [...(panel.value?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

watch(() => props.modelValue, open => {
  if (open) {
    previousFocus = document.activeElement
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeydown)
    nextTick(() => (panel.value?.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || panel.value)?.focus())
  } else {
    document.body.style.overflow = previousOverflow
    document.removeEventListener('keydown', handleKeydown)
    previousFocus?.focus?.()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-layer" @mousedown.self="handleBackdrop">
        <section ref="panel" class="modal" :class="`modal--${size}`" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
          <header class="modal__header"><div><h2 :id="titleId">{{ title }}</h2><p v-if="description">{{ description }}</p></div><UiButton variant="ghost" size="icon" title="关闭弹窗" @click="close"><AppIcon name="close" /></UiButton></header>
          <div class="modal__body"><slot /></div>
          <footer v-if="$slots.footer" class="modal__footer"><slot name="footer" :close="close" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
