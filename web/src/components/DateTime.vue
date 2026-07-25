<script setup>
import { computed } from 'vue'

const props = defineProps({ value: { type: [String, Number, Date], default: null }, empty: { type: String, default: '-' } })

const date = computed(() => props.value ? new Date(props.value) : null)
const valid = computed(() => date.value && !Number.isNaN(date.value.getTime()))
const text = computed(() => valid.value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(date.value) : props.empty)
const datetime = computed(() => valid.value ? date.value.toISOString() : undefined)
</script>

<template><time class="date-time" :datetime="datetime">{{ text }}</time></template>

<style scoped>
.date-time { color: var(--text-faint); font-size: 12px; }
</style>
