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
  <div class="ui-switch" :class="{ disabled }">
    <span class="ui-switch__copy"><strong>{{ label }}</strong><small v-if="description">{{ description }}</small></span>
    <button type="button" class="ui-switch__control" role="switch" :aria-label="label" :aria-checked="modelValue" :disabled="disabled" @click="$emit('update:modelValue', !modelValue)"><span /></button>
  </div>
</template>
