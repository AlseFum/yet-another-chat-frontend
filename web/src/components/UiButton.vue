<script setup>
defineProps({
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'md' },
  active: { type: Boolean, default: false },
})
</script>

<template>
  <button :type="type" class="ui-button" :class="[`ui-button--${variant}`, `ui-button--${size}`, { active }]"><slot /></button>
</template>
