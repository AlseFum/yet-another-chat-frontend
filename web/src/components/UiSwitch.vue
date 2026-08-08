<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <button type="button" class="ui-switch" :class="{ disabled }" role="switch" :aria-checked="modelValue" :disabled="disabled" @click="$emit('update:modelValue', !modelValue)">
    <span class="ui-switch__copy"><strong>{{ label }}</strong><small v-if="description">{{ description }}</small></span>
    <span class="ui-switch__control" aria-hidden="true"><span /></span>
  </button>
</template>
