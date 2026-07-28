<script setup>
defineProps({
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'md' },
  active: { type: Boolean, default: false },
})
</script>

<template>
  <button class="ui-button" :class="[`ui-button--${variant}`, `ui-button--${size}`, { active }]"><slot /></button>
</template>
