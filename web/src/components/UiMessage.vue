<script setup>
import { computed } from 'vue'
import AppIcon from './AppIcon.js'
import UiButton from './UiButton.vue'

const props = defineProps({
  tone: { type: String, default: 'info' },
  title: { type: String, default: '' },
  dismissible: { type: Boolean, default: false },
})
defineEmits(['dismiss'])

const icon = computed(() => ({ success: 'check', danger: 'close', warning: 'info', info: 'info' })[props.tone] || 'info')
</script>

<template>
  <aside class="ui-message" :class="`ui-message--${tone}`" role="note">
    <AppIcon class="ui-message__icon" :name="icon" />
    <div class="ui-message__content"><strong v-if="title">{{ title }}</strong><div><slot /></div><div v-if="$slots.actions" class="ui-message__actions"><slot name="actions" /></div></div>
    <UiButton v-if="dismissible" variant="ghost" size="icon" title="关闭提示" @click="$emit('dismiss')"><AppIcon name="close" /></UiButton>
  </aside>
</template>
