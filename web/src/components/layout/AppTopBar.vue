<script setup>
import Button from '../Button.vue'
import Icon from '../Icon.vue'

defineProps({
  workspace: { type: String, required: true },
  darkMode: { type: Boolean, default: true },
  renderMarkdown: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-sidebar', 'toggle-theme', 'toggle-settings', 'toggle-markdown', 'workspace-transfer'])
</script>

<template>
  <header id="top-bar">
    <div id="key-bar">
      <Button id="sidebar-toggle" variant="ghost" size="icon" @click="emit('toggle-sidebar')"><Icon name="menu" /></Button>
      <span id="workspace-badge"><Icon name="folder" size="13" />{{ workspace }}</span>
    </div>
    <Button variant="ghost" size="icon" title="导入或导出 Workspace" @click="emit('workspace-transfer')"><Icon name="transfer" /></Button>
    <Button id="darkmode-toggle" variant="ghost" size="icon" :title="darkMode ? '切换到浅色模式' : '切换到深色模式'" @click="emit('toggle-theme')">
      <svg v-if="darkMode" class="theme-icon moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" /></svg>
      <svg v-else class="theme-icon sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>
    </Button>
    <Button id="settings-toggle" variant="ghost" size="icon" @click="emit('toggle-settings')"><Icon name="settings" /></Button>
    <Button id="md-toggle" variant="ghost" size="sm" :class="{ active: renderMarkdown }" :title="renderMarkdown ? '关闭 Markdown 渲染' : '启用 Markdown 渲染'" @click="emit('toggle-markdown')">MD</Button>
  </header>
</template>
