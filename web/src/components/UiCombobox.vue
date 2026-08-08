<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.js'
import UiModal from './UiModal.vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  title: { type: String, default: '选择一项' },
  presentation: { type: String, default: 'auto' },
  searchable: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change'])
const root = ref(null)
const trigger = ref(null)
const searchInput = ref(null)
const open = ref(false)
const modalMode = ref(false)
const query = ref('')
const activeIndex = ref(0)

const normalizedOptions = computed(() => props.options.map(option => typeof option === 'object' ? option : { value: option, label: String(option) }))
const selected = computed(() => normalizedOptions.value.find(option => option.value === props.modelValue))
const filteredOptions = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return normalizedOptions.value
  return normalizedOptions.value.filter(option => `${option.label} ${option.description || ''}`.toLocaleLowerCase().includes(needle))
})

function constrained() {
  if (props.presentation === 'modal') return true
  if (props.presentation === 'dropdown') return false
  const rect = root.value?.getBoundingClientRect()
  return window.matchMedia('(max-width: 760px)').matches || !rect || window.innerHeight - rect.bottom < 280
}

function show() {
  if (props.disabled) return
  modalMode.value = constrained()
  query.value = ''
  activeIndex.value = Math.max(0, normalizedOptions.value.findIndex(option => option.value === props.modelValue))
  open.value = true
  nextTick(() => searchInput.value?.focus())
}

function close(restoreFocus = true) {
  open.value = false
  query.value = ''
  if (restoreFocus) nextTick(() => trigger.value?.focus())
}

function select(option) {
  emit('update:modelValue', option.value)
  emit('change', option)
  close()
}

function handleOutside(event) {
  if (open.value && !modalMode.value && !root.value?.contains(event.target)) close(false)
}

function handleKeydown(event) {
  if (!open.value) return
  if (event.key === 'Escape') return close()
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % Math.max(1, filteredOptions.value.length)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + Math.max(1, filteredOptions.value.length)) % Math.max(1, filteredOptions.value.length)
  } else if (event.key === 'Enter' && filteredOptions.value[activeIndex.value]) {
    event.preventDefault()
    select(filteredOptions.value[activeIndex.value])
  }
}

watch(query, () => { activeIndex.value = 0 })

onMounted(() => {
  document.addEventListener('pointerdown', handleOutside)
  document.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="ui-combobox" :class="{ compact, open }">
    <button ref="trigger" type="button" class="combobox-trigger" :disabled="disabled" :aria-expanded="open" :aria-haspopup="modalMode ? 'dialog' : 'listbox'" @keydown.down.prevent="show" @click="open ? close() : show()">
      <slot name="prefix" />
      <span :class="{ placeholder: !selected }">{{ selected?.label || placeholder }}</span>
      <AppIcon name="chevron" size="12" />
    </button>

    <div v-if="open && !modalMode" class="combobox-dropdown">
      <div v-if="searchable" class="combobox-search"><AppIcon name="message" size="13" /><input ref="searchInput" v-model="query" placeholder="搜索选项" /></div>
      <div class="combobox-options" role="listbox">
        <button v-for="(option, index) in filteredOptions" :key="option.value" type="button" role="option" :aria-selected="option.value === modelValue" :class="{ selected: option.value === modelValue, active: activeIndex === index }" @mouseenter="activeIndex = index" @click="select(option)"><span><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span><AppIcon v-if="option.value === modelValue" name="check" size="14" /></button>
        <p v-if="!filteredOptions.length">没有匹配项</p>
      </div>
    </div>

    <UiModal v-if="modalMode" v-model="open" :title="title" size="sm" @close="query = ''">
      <div v-if="searchable" class="combobox-search modal-search"><AppIcon name="message" size="13" /><input ref="searchInput" v-model="query" placeholder="搜索选项" /></div>
      <div class="combobox-options modal-options" role="listbox">
        <button v-for="(option, index) in filteredOptions" :key="option.value" type="button" role="option" :aria-selected="option.value === modelValue" :class="{ selected: option.value === modelValue, active: activeIndex === index }" @mouseenter="activeIndex = index" @click="select(option)"><span><strong>{{ option.label }}</strong><small v-if="option.description">{{ option.description }}</small></span><AppIcon v-if="option.value === modelValue" name="check" size="14" /></button>
        <p v-if="!filteredOptions.length">没有匹配项</p>
      </div>
    </UiModal>
  </div>
</template>
