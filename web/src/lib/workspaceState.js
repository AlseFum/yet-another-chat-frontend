import { computed, reactive } from 'vue'
import { apiDelete, apiGet, apiPost, apiPut, apiSetDefaultApiKey } from './api.js'
import { asArray, genId, removeByKey } from '../../../util/data.js'
import { createSession, createTalk } from '../features/talk/model.js'

export const DEFAULTS = Object.freeze({ apiKeyId: '', sysPrompt: '你是一个乐于思考的中文助手。直接给出清晰、有帮助的回答，不展示内部推理过程。', model: 'deepseek-v4-flash', temperature: '0.7', maxTokens: '4096' })

export function createWorkspaceState({ editor } = {}) {
  // Base workspace state
  const state = reactive({
    conversations: [], talks: [], texts: [], tools: [], presets: [], workflows: [], apiKeys: [], llmJobs: [],
    activeId: null, activeTalkId: null, activeTalkSessionId: null, activeWfId: null, DEFAULTS, genId,
    ui: {
      loading: false, abortController: null, runningConvIds: [], historyEditing: false, settingsOpen: false,
      sidebarOpen: window.innerWidth > 768, currentView: 'chat', renderMarkdown: false,
      darkMode: localStorage.getItem('darkMode') !== 'false',
    },
    workflow: {
      nodes: [], edges: [], executing: false, currentExecNode: null, execStates: {},
      execResults: {}, execLogs: [], showResults: false,
    },
  })

  // UI state helpers
  state.ui.toggleDarkMode = () => {
    state.ui.darkMode = !state.ui.darkMode
    localStorage.setItem('darkMode', state.ui.darkMode)
    document.body.classList.toggle('light-mode', !state.ui.darkMode)
  }
  state.ui.syncSidebar = () => {
    document.body.classList.toggle('sidebar-open', state.ui.sidebarOpen)
    document.body.classList.toggle('sidebar-closed', !state.ui.sidebarOpen)
  }
  state.ui.setSidebarOpen = open => {
    console.log("setSidebarOpen: old",state.ui.sidebarOpen," new",open)
    state.ui.sidebarOpen = open
    state.ui.syncSidebar()
  }

  // Derived state and resource lookups
  state.activeConv = computed(() => state.conversations.find(c => c.id === state.activeId))
  state.activeTalk = computed(() => state.talks.find(talk => talk.id === state.activeTalkId))
  state.activeWorkflow = computed(() => state.workflows.find(w => w.id === state.activeWfId))
  state.getConv = id => state.conversations.find(c => c.id === id)
  state.textByName = name => state.texts.find(t => t.name === name)
  state.toolByName = name => state.tools.find(t => t.name === name)
  state.presetById = id => state.presets.find(p => p.id === id)
  state.apiKeyById = id => state.apiKeys.find(key => key.id === id)
  state.defaultApiKeyId = () => state.apiKeys.find(key => key.isDefault)?.id || ''

  // Resource loading and persistence
  state.loadAll = async () => {
    const [conversations, talks, texts, tools, presets, workflows, apiKeys] = await Promise.all(['convs', 'talks', 'texts', 'tools', 'presets', 'workflows', 'api-keys'].map(apiGet))
    if (Array.isArray(conversations)) {
      const ids = new Set()
      state.conversations = conversations.map(conversation => {
        let id = conversation.id
        while (!id || ids.has(id)) id = genId()
        ids.add(id)
        return id === conversation.id ? conversation : { ...conversation, id }
      })
    }
    state.talks = asArray(talks)
    state.texts = asArray(texts)
    state.tools = asArray(tools)
    state.presets = asArray(presets)
    state.workflows = asArray(workflows)
    state.apiKeys = asArray(apiKeys)
  }
  for (const [property, resource] of Object.entries({ saveConvs: 'convs', saveTalks: 'talks', saveTexts: 'texts', saveTools: 'tools', savePresets: 'presets', saveWorkflows: 'workflows' })) state[property] = () => apiPut(resource, state[{ convs: 'conversations', talks: 'talks', texts: 'texts', tools: 'tools', presets: 'presets', workflows: 'workflows' }[resource]])

  // View navigation
  const mobile = () => { if (window.innerWidth <= 768) state.ui.setSidebarOpen(false) }
  state.back = () => {
    if (editor) editor.value = null
    state.ui.currentView = 'chat'
  }
  state.openEditor = (type, item) => {
    if (editor) editor.value = { type, id: item?.id || item?.name || null }
    state.ui.currentView = `${type}-edit`
    mobile()
  }
  state.openApiKeys = () => {
    state.ui.currentView = 'api-keys'
    mobile()
  }
  state.openLLMJobs = () => {
    state.ui.currentView = 'llm-jobs'
    mobile()
  }
  state.openWorkspaceTransfer = () => {
    state.ui.currentView = 'workspace-transfer'
    mobile()
  }

  // Talk management
  state.switchConv = (id) => {
    state.activeId = id
    state.ui.loading = state.ui.runningConvIds.includes(id)
    state.ui.currentView = 'chat'
    mobile()
  }
  state.openTalkCreator = () => {
    state.ui.currentView = 'talk-create'
    mobile()
  }
  state.createTalk = async ({ name, persona, apiKeyId }) => {
    if (!state.apiKeyById(apiKeyId)) return
    const talk = createTalk({ id: state.genId(), name, persona, apiKeyId })
    state.talks.push(talk)
    state.activeTalkId = talk.id
    state.activeTalkSessionId = null
    state.ui.currentView = 'talk'
    await state.saveTalks()
    mobile()
  }
  state.selectTalk = (id) => {
    const talk = state.getTalk(id)
    if (!talk) return
    state.activeTalkId = id
    state.activeTalkSessionId = talk.sessions[0]?.id || null
    state.ui.currentView = 'talk'
    mobile()
  }
  state.getTalk = id => state.talks.find(talk => talk.id === id)
  state.selectTalkSession = (id) => {
    if (state.activeTalk?.sessions.some(session => session.id === id)) state.activeTalkSessionId = id
  }
  state.createTalkSession = async () => {
    const talk = state.activeTalk
    if (!talk) return
    const session = createSession({ id: state.genId(), name: `时段 ${talk.sessions.length + 1}` })
    talk.sessions.push(session)
    state.activeTalkSessionId = session.id
    await state.saveTalks()
  }
  state.renameTalkSession = async (id, name) => {
    const session = state.activeTalk?.sessions.find(item => item.id === id)
    const nextName = String(name || '').trim()
    if (!session || !nextName) return false
    session.name = nextName
    await state.saveTalks()
    return true
  }
  state.deleteTalkSession = async (id) => {
    const talk = state.activeTalk
    const index = talk?.sessions.findIndex(session => session.id === id) ?? -1
    if (index < 0) return
    talk.sessions.splice(index, 1)
    if (state.activeTalkSessionId === id) state.activeTalkSessionId = talk.sessions[index]?.id || talk.sessions[index - 1]?.id || null
    await state.saveTalks()
  }
  state.deleteTalk = async (id) => {
    state.talks = removeByKey(state.talks, 'id', id)
    if (state.activeTalkId === id) {
      state.activeTalkId = state.talks[0]?.id || null
      state.activeTalkSessionId = state.activeTalk?.sessions[0]?.id || null
      state.ui.currentView = state.activeTalk ? 'talk' : 'chat'
    }
    await state.saveTalks()
  }

  // Conversation management
  state.newConv = async () => {
    const source = state.activeConv || state.DEFAULTS
    const defaultApiKeyId = state.defaultApiKeyId()
    const conv = {
      id: state.genId(), name: `对话 ${state.conversations.length + 1}`, messages: [],
      apiKeyId: defaultApiKeyId || source.apiKeyId || '', sysPrompt: source.sysPrompt || '', model: source.model || '',
      temperature: source.temperature || '', maxTokens: source.maxTokens || '',
    }
    state.conversations.push(conv)
    state.activeId = conv.id
    await state.saveConvs()
    mobile()
  }
  state.deleteConv = async (id) => {
    state.conversations = removeByKey(state.conversations, 'id', id)
    if (state.activeId === id) state.activeId = state.conversations[0]?.id || null
    await state.saveConvs()
  }
  state.renameConv = async (id, name) => {
    const conv = state.getConv(id)
    if (conv && name?.trim()) { conv.name = name.trim(); await state.saveConvs() }
  }
  state.clearHistory = async () => {
    const conv = state.activeConv
    if (conv?.messages.length && confirm('清空当前对话的所有消息？')) { conv.messages = []; await state.saveConvs() }
  }
  state.deleteMsg = async (index) => {
    const conv = state.activeConv
    if (conv) { conv.messages.splice(index); await state.saveConvs() }
  }
  state.editMsg = async (index, content) => {
    const message = state.activeConv?.messages[index]
    if (message) {
      message.content = content
      message.rawContent = content
      state.activeConv.messages.splice(index + 1)
      await state.saveConvs()
    }
  }
  state.reeditMessage = async (index) => {
    const conv = state.activeConv
    if (conv?.messages[index]?.role === 'user') { conv.messages.splice(index); await state.saveConvs() }
  }
  state.saveSettings = async (settings) => {
    if (state.activeConv) { Object.assign(state.activeConv, settings); await state.saveConvs() }
  }

  // Text resources
  state.saveText = async (draft) => {
    const old = editor?.value?.id
    const previous = old && state.textByName(old)
    if (old && old !== draft.name) state.texts = removeByKey(state.texts, 'name', old)
    const text = state.textByName(draft.name)
    if (text) text.content = draft.content
    else state.texts.push({ name: draft.name, content: draft.content, highlightRules: previous?.highlightRules, highlightTheme: previous?.highlightTheme })
    await state.saveTexts()
  }
  state.deleteText = async (name) => {
    state.texts = removeByKey(state.texts, 'name', name)
    await state.saveTexts()
  }

  // Tool resources
  state.saveTool = async (draft) => {
    const old = editor?.value?.id
    if (old && old !== draft.name) state.tools = removeByKey(state.tools, 'name', old)
    const tool = state.toolByName(draft.name)
    if (tool) Object.assign(tool, draft)
    else state.tools.push({ name: draft.name, desc: draft.desc, code: draft.code })
    await state.saveTools()
    state.back()
  }
  state.deleteTool = async (name) => {
    state.tools = removeByKey(state.tools, 'name', name)
    await state.saveTools()
  }

  // Preset resources
  state.savePreset = async (draft) => {
    const old = editor?.value?.id
    const preset = old && state.presetById(old)
    if (preset) Object.assign(preset, { name: draft.name, prompt: draft.content, temperature: draft.temperature, maxTokens: draft.maxTokens })
    else state.presets.push({ id: state.genId(), name: draft.name, prompt: draft.content, temperature: draft.temperature, maxTokens: draft.maxTokens })
    await state.savePresets()
    state.back()
  }
  state.deletePreset = async (id) => {
    state.presets = removeByKey(state.presets, 'id', id)
    await state.savePresets()
  }

  // Workflow management
  state.newWorkflow = async () => {
    const item = { id: state.genId(), name: `流程 ${state.workflows.length + 1}`, nodes: [], edges: [], lastResults: {}, lastLogs: [] }
    state.workflows.push(item)
    state.activeWfId = item.id
    state.ui.currentView = 'workflow'
    await state.saveWorkflows()
    mobile()
  }
  state.selectWorkflow = (id) => {
    state.activeWfId = id
    state.ui.currentView = 'workflow'
    mobile()
  }
  state.deleteWorkflow = async (id) => {
    state.workflows = removeByKey(state.workflows, 'id', id)
    if (state.activeWfId === id) state.activeWfId = state.workflows[0]?.id || null
    if (!state.activeWfId) state.ui.currentView = 'chat'
    await state.saveWorkflows()
  }
  state.saveWorkflow = async (item) => {
    const index = state.workflows.findIndex(w => w.id === item.id)
    if (index >= 0) state.workflows[index] = item
    await state.saveWorkflows()
  }

  // API credentials
  state.createApiKey = async (credential) => {
    const created = await apiPost('api-keys', credential)
    if (created.isDefault) state.apiKeys.forEach(key => { key.isDefault = false })
    state.apiKeys.push(created)
  }
  state.setDefaultApiKey = async (id) => {
    const defaultKey = await apiSetDefaultApiKey(id)
    state.apiKeys = state.apiKeys.map(key => key.id === defaultKey.id ? defaultKey : { ...key, isDefault: false })
  }
  state.deleteApiKey = async (id) => {
    const key = state.apiKeyById(id)
    if (!key || !confirm(`删除 API Key "${key.name}"？使用它的对话和流程将无法请求服务。`)) return
    await apiDelete('api-keys', id)
    state.apiKeys = removeByKey(state.apiKeys, 'id', id)
    for (const conversation of state.conversations) if (conversation.apiKeyId === id) conversation.apiKeyId = ''
    for (const workflow of state.workflows) if (workflow.wfApiKeyId === id) workflow.wfApiKeyId = ''
    await Promise.all([state.saveConvs(), state.saveWorkflows()])
  }

  return state
}
