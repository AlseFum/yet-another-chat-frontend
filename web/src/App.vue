<script setup>
import { computed, provide, reactive, ref } from 'vue'
import ChatView from './applications/chat/ui/ChatView.vue'
import ResourceView from './applications/resource/ui/ResourceView.vue'
import UiCombobox from './components/UiCombobox.vue'
import UiSwitch from './components/UiSwitch.vue'
import UiToastViewport from './components/UiToastViewport.vue'
import WorkbenchLayout from './components/layout/WorkbenchLayout.vue'
import { createWorkspaceFixture } from './fixtures.js'
import { ThemeKey } from './theme/contract.js'
import { createThemeContext } from './theme/manager.js'
import ApiKeysView from './views/ApiKeysView.vue'
import JobsView from './views/JobsView.vue'
import TransferView from './views/TransferView.vue'
import WorkspaceNavigation from './workspace/WorkspaceNavigation.vue'
import WorkspaceToolbar from './workspace/WorkspaceToolbar.vue'

const theme = createThemeContext()
provide(ThemeKey, theme)

const workspace = reactive(createWorkspaceFixture())
const view = ref('chat')
const active = reactive({ chat: workspace.conversations[0].id, resource: 'text' })
const sidebarOpen = ref(window.innerWidth > 760)
const settingsOpen = ref(false)
const renderMarkdown = ref(true)
const selectedKey = ref('key-main')
const toasts = ref([])
let toastId = 0
const keyOptions = workspace.keys.map(key => ({ value: key.id, label: key.name, description: key.provider }))

const activeId = computed(() => active[view.value] || '')
const conversation = computed(() => workspace.conversations.find(item => item.id === active.chat))

function select(type, id) {
  view.value = type
  active[type] = id
  if (window.innerWidth <= 760) sidebarOpen.value = false
}

function navigate(target) {
  view.value = target
  if (window.innerWidth <= 760) sidebarOpen.value = false
}

function create(type) {
  if (type === 'chat') {
    const item = { id: `fixture-${Date.now()}`, name: '新对话', messages: [] }
    workspace.conversations.push(item)
    select('chat', item.id)
  }
}

function sendMessage(content) {
  conversation.value.messages.push({ id: `fixture-${Date.now()}`, role: 'user', content })
  notify('消息已写入内存 fixture')
}

function dismissToast(id) {
  toasts.value = toasts.value.filter(item => item.id !== id)
}

function notify(message, tone = 'success') {
  const id = ++toastId
  toasts.value.push({ id, message, tone })
  window.setTimeout(() => dismissToast(id), 1500)
}
</script>

<template>
  <WorkbenchLayout :sidebar-open="sidebarOpen" @close-sidebar="sidebarOpen = false">
    <template #sidebar><WorkspaceNavigation :workspace="workspace" :view="view" :active-id="activeId" @navigate="navigate" @select="select" @create="create" /></template>
    <template #toolbar><WorkspaceToolbar :workspace="workspace.name" :dark="theme.isDark.value" :theme-id="theme.activeTheme.value.id" :themes="theme.availableThemes.value" @toggle-sidebar="sidebarOpen = !sidebarOpen" @toggle-theme="theme.toggleColorScheme" @change-theme="theme.setTheme" @toggle-settings="settingsOpen = !settingsOpen" @transfer="navigate('transfer')" /></template>
      <section v-if="settingsOpen" class="settings-panel">
        <div class="setting-field"><span>API Key</span><UiCombobox v-model="selectedKey" :options="keyOptions" title="选择 API Key" /></div>
        <label>模型<input value="deepseek-chat" /></label>
        <label>Temperature<input value="0.7" /></label>
        <label>Max tokens<input value="4096" /></label>
        <UiSwitch v-model="renderMarkdown" label="渲染 Markdown" description="格式化消息中的标题、列表和代码块" />
      </section>
      <main :key="theme.revision.value" class="workbench__content">
        <ChatView     v-if="view === 'chat'" :conversation="conversation" :render-markdown="renderMarkdown" @send="sendMessage" />
        <ResourceView v-else-if="view === 'resource'" :type="active.resource" :resources="workspace.resources" />
        <ApiKeysView  v-else-if="view === 'keys'" :keys="workspace.keys" />
        <JobsView     v-else-if="view === 'jobs'" :jobs="workspace.jobs" />
        <TransferView v-else-if="view === 'transfer'" :workspace="workspace.name" />
      </main>
    <UiToastViewport :items="toasts" @dismiss="dismissToast" />
  </WorkbenchLayout>
</template>
