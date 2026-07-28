<script setup>
defineProps({ sidebarOpen: { type: Boolean, default: true } })
defineEmits(['close-sidebar'])
</script>

<template>
  <div class="workbench" :class="{ 'sidebar-closed': !sidebarOpen }">
    <aside class="workbench__sidebar"><slot name="sidebar" /></aside>
    <button class="sidebar-overlay" aria-label="关闭侧栏" @click="$emit('close-sidebar')" />
    <div class="workbench__main"><slot name="toolbar" /><slot /></div>
  </div>
</template>
