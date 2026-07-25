<script setup>
defineProps({
  padding: { type: String, default: '16px' },
})
</script>

<template>
  <section class="card" :style="{ padding }">
    <slot />
  </section>
</template>

<style scoped>
.card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--glass-panel); }
</style>
