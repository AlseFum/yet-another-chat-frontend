<script setup>
import AppIcon from './AppIcon.js'
import UiButton from './UiButton.vue'

defineProps({ items: { type: Array, default: () => [] } })
defineEmits(['dismiss'])

function icon(tone) {
  return ({ success: 'check', danger: 'close', warning: 'info', info: 'info' })[tone] || 'info'
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-viewport" aria-live="polite" aria-relevant="additions removals">
      <TransitionGroup name="toast-list">
        <article v-for="item in items" :key="item.id" class="ui-toast" :class="`ui-toast--${item.tone || 'info'}`" role="status">
          <AppIcon :name="icon(item.tone)" />
          <div><strong v-if="item.title">{{ item.title }}</strong><p>{{ item.message }}</p></div>
          <UiButton variant="ghost" size="icon" title="关闭通知" @click="$emit('dismiss', item.id)"><AppIcon name="close" size="13" /></UiButton>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
