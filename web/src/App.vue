<script setup>
import { provide, ref, onErrorCaptured, onMounted, onUnmounted } from 'vue'
import { getWorkspace } from './lib/api.js'
import { createWorkspaceState } from './lib/workspaceState.js'
import { WorkspaceContext, AppUIContext, EditorContext, WorkflowContext } from './lib/contexts.js'
import { createClient } from './lib/client.js'
import { createConnectionState } from './lib/connection.js'
import Toast from './components/Toast.vue'
import { toast } from './components/Toast.vue'
import { assignColors } from './components/editor/highlightUtils.js'
import Sidebar from './components/layout/Sidebar.vue'; import ChatView from './features/chat/ChatView.vue'; import WorkflowView from './features/workflow/WorkflowView.vue'; import ApiKeyManager from './views/ApiKeyManager.vue'; import ConversationSettings from './views/ConversationSettings.vue'; import AppTopBar from './components/layout/AppTopBar.vue'; import TextEditorView from './views/TextEditorView.vue'; import ToolEditorView from './views/ToolEditorView.vue'; import PresetEditorView from './views/PresetEditorView.vue'; import LLMJobsView from './views/LLMJobsView.vue'; import WorkspaceTransferView from './views/WorkspaceTransferView.vue'
import TalkCreateView from './features/talk/TalkCreateView.vue'
import TalkView from './features/talk/TalkView.vue'

const editor = ref(null)
const workspace = createWorkspaceState({ editor })
const { ui } = workspace
workspace.connection = createConnectionState()
const client = createClient(workspace, ui)
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || '发生未知错误')
}

function reportError(error) {
  console.error(error)
  toast.error(errorMessage(error))
}

function handleUnhandledRejection(event) {
  event.preventDefault()
  reportError(event.reason)
}

function handleWindowError(event) {
  if (event.error) reportError(event.error)
}

onErrorCaptured(error => {
  reportError(error)
  return false
})

provide(WorkspaceContext, workspace); provide(AppUIContext, ui); provide(EditorContext, editor); provide(WorkflowContext, workspace.workflow)

async function highlight(draft) {
  const text = workspace.textByName(editor.value?.id)
  if (!draft.content?.trim()) return
  const rules = await client.generateHighlightRules(draft.content)
  const names = [...new Set(Object.values(rules.scopes).flatMap(scope => (scope.patterns || []).map(pattern => pattern.name).filter(Boolean)))]
  if (text) { text.highlightRules = rules; text.highlightTheme = assignColors({}, names) }
}

async function send(text) {
  try { await client.send(text) } catch (error) { toast.error(errorMessage(error)) }
}

onMounted(async () => {
  window.addEventListener('error', handleWindowError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  ui.syncSidebar(); await workspace.loadAll(); if (!workspace.conversations.length) await workspace.newConv(); workspace.activeId ||= workspace.conversations[0].id; client.syncConversations(); void client.syncJobs(); if (!ui.darkMode) document.body.classList.add('light-mode')
})
onUnmounted(() => {
  window.removeEventListener('error', handleWindowError)
  window.removeEventListener('unhandledrejection', handleUnhandledRejection)
  client.close()
})
</script>
<template>
  <div id="sidebar">
    <Sidebar
      :conversations="workspace.conversations"
      :active-id="workspace.activeId"
      :talks="workspace.talks"
      :active-talk-id="workspace.activeTalkId"
      :texts="workspace.texts"
      :tools="workspace.tools"
      :presets="workspace.presets"
      :workflows="workspace.workflows"
      :active-wf-id="workspace.activeWfId"
      :current-view="ui.currentView"
      @select="workspace.switchConv"
      @new-conv="workspace.newConv"
      @delete-conv="workspace.deleteConv"
      @rename-conv="workspace.renameConv"
      @clear-history="workspace.clearHistory"
      @select-talk="workspace.selectTalk"
      @open-talk-creator="workspace.openTalkCreator"
      @delete-talk="workspace.deleteTalk"
      @open-text-editor="name => workspace.openEditor('text', workspace.textByName(name))"
      @delete-text="workspace.deleteText"
      @open-tool-editor="name => workspace.openEditor('tool', workspace.toolByName(name))"
      @delete-tool="workspace.deleteTool"
      @open-preset-editor="id => workspace.openEditor('preset', workspace.presetById(id))"
      @delete-preset="workspace.deletePreset"
      @select-workflow="workspace.selectWorkflow"
      @new-workflow="workspace.newWorkflow"
      @delete-workflow="workspace.deleteWorkflow"
      @open-api-keys="workspace.openApiKeys"
      @open-llm-jobs="workspace.openLLMJobs"
    />
  </div>
  <div id="sidebar-overlay" @click="ui.setSidebarOpen(false)" />

  <div id="main">
    <AppTopBar
      :workspace="getWorkspace()"
      :dark-mode="ui.darkMode"
      :render-markdown="ui.renderMarkdown"
      @toggle-sidebar="ui.setSidebarOpen(!ui.sidebarOpen)"
      @toggle-theme="ui.toggleDarkMode()"
      @toggle-settings="ui.settingsOpen = !ui.settingsOpen"
      @toggle-markdown="ui.renderMarkdown = !ui.renderMarkdown"
      @workspace-transfer="workspace.openWorkspaceTransfer"
    />
    <ConversationSettings
      :open="ui.settingsOpen"
      @save="workspace.saveSettings"
      @open-api-keys="workspace.openApiKeys"
    />

    <ChatView
      v-if="ui.currentView === 'chat'"
      :conv="workspace.activeConv"
      :render-markdown="ui.renderMarkdown"
      @send="send"
      @delete-msg="workspace.deleteMsg"
      @edit-msg="workspace.editMsg"
      @reedit="workspace.reeditMessage"
      @stop="client.stopGenerating"
    />
    <TalkCreateView
      v-else-if="ui.currentView === 'talk-create'"
      :api-keys="workspace.apiKeys"
      :generate-talk="client.aiWriteTalk"
      @create="workspace.createTalk"
      @back="workspace.back"
    />
    <TalkView
      v-else-if="ui.currentView === 'talk' && workspace.activeTalk"
      :talk="workspace.activeTalk"
      :active-session-id="workspace.activeTalkSessionId"
      :gen-id="workspace.genId"
      :api-keys="workspace.apiKeys"
      :run-stage="client.talkRunStage"
      @save="workspace.saveTalks"
      @create-session="workspace.createTalkSession"
      @select-session="workspace.selectTalkSession"
      @rename-session="workspace.renameTalkSession"
      @delete-session="workspace.deleteTalkSession"
    />
    <LLMJobsView
      v-else-if="ui.currentView === 'llm-jobs'"
      :jobs="workspace.llmJobs"
      @back="workspace.back"
    />
    <WorkspaceTransferView
      v-else-if="ui.currentView === 'workspace-transfer'"
      :workspace="getWorkspace()"
      @back="workspace.back"
      @imported="workspace.loadAll"
    />

    <WorkflowView
      v-if="ui.currentView === 'workflow' && workspace.activeWorkflow"
      :workflow="workspace.activeWorkflow"
      :tools="workspace.tools"
      :texts="workspace.texts"
      :presets="workspace.presets"
      :api-keys="workspace.apiKeys"
      @save="workspace.saveWorkflow"
      @run-prompt="client.wfRunPrompt"
      @run-tool="client.wfRunTool"
    />
    <ApiKeyManager
      v-if="ui.currentView === 'api-keys'"
      :api-keys="workspace.apiKeys"
      :create-credential="workspace.createApiKey"
      :set-default="workspace.setDefaultApiKey"
      @delete="workspace.deleteApiKey"
      @back="workspace.back"
    />

    <TextEditorView
      v-if="ui.currentView === 'text-edit'"
      :item="workspace.textByName(editor?.id)"
      @back="workspace.back"
      @save="workspace.saveText"
      @highlight="highlight"
    />
    <ToolEditorView
      v-else-if="ui.currentView === 'tool-edit'"
      :item="workspace.toolByName(editor?.id)"
      @back="workspace.back"
      @save="workspace.saveTool"
      @write="client.aiWriteTool"
    />
    <PresetEditorView
      v-else-if="ui.currentView === 'preset-edit'"
      :item="workspace.presetById(editor?.id)"
      @back="workspace.back"
      @save="workspace.savePreset"
      @write="client.aiWritePreset"
    />
  </div>
  <Toast />
</template>
