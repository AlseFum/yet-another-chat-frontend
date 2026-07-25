import { ApiConfig, createChatJobRequest, createHighlightRulesJobRequest, createPresetWriterJobRequest, createTalkStageJobRequest, createTalkWriterJobRequest, createToolWriterJobRequest, createWorkflowPromptJobRequest } from '../../../llm/index.js'
import { coerceNumFallback, stringifyResult } from '../../../util/data.js'
import { createConversationSocket } from '../features/chat/socket.js'
import { createJobMirrorRegistry, createLocalJobMirror, createRemoteJobMirror } from './jobMirror.js'
import { toast } from '../components/Toast.vue'

// --- Pure utilities ---

function dispatch(nodeId, result, error) {
  window.dispatchEvent(new CustomEvent('wf-async-result', { detail: { nodeId, result, error } }))
}

// --- Text / tool helpers ---

function parseToolCall(content) {
  try {
    const match = content.match(/```tool\n([\s\S]*?)```/)
    const value = match && JSON.parse(match[1])
    return value?.name && value.args !== undefined ? value : null
  } catch { return null }
}

function toolPrompt(tools) {
  if (!tools.length) return ''
  const list = tools.map(tool => `- ${tool.name}: ${tool.desc}`).join('\n')
  return `你可以通过以下格式调用工具。一次调用一个。\n\n\`\`\`tool\n{"name":"<工具名>","args":{...}}\n\`\`\`\n\n可用工具：\n${list}`
}

function expandTextMentions(content, resolve) {
  return content.replace(/@\[([^\]\r\n]+)]/g, (_, name) => {
    const text = resolve(name)
    return text ? `[引用文本：${text.name}]\n${text.content}\n[/引用文本]` : _
  })
}

// --- LLM request ---

function resolveApiConfig(workspace, options = {}) {
  const temporary = workspace.connection
  if (temporary?.mode === 'direct' && temporary.apiKey && temporary.baseUrl) return ApiConfig.fromDirect(temporary)
  const conv = workspace.activeConv
  const id = options.apiKeyId || conv?.apiKeyId
  if (!id) throw new Error('请先选择 API Key')
  const credential = workspace.apiKeyById(id)
  if (!credential) throw new Error('当前 API Key 已被删除，请在设置中重新选择')
  return ApiConfig.fromCredential(credential)
}

function requestConfig(workspace, options = {}) {
  const conv = workspace.activeConv
  const temperature = coerceNumFallback(options.temperature, options.wfTemp, conv?.temperature)
  return {
    model: options.model || conv?.model || workspace.DEFAULTS.model,
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7,
    maxTokens: parseInt(options.maxTokens || options.wfMaxTok) || parseInt(conv?.maxTokens) || 4096,
  }
}

async function callLLM(workspace, request, options = {}) {
  const apiConfig = resolveApiConfig(workspace, options)
  const mirror = await options.submit(apiConfig, request, { source: options.source, signal: options.signal })
  const value = await mirror.result
  return { choices: [{ message: { content: mirror.responseText } }], validatedOutput: value, mirror }
}

// --- Tool execution ---

async function executeTool(workspace, name, args) {
  const tool = workspace.toolByName(name)
  if (!tool) return `工具 "${name}" 未找到`
  try {
    const conv = workspace.activeConv
    const ctx = {
      args, fetch,
      texts: workspace.texts,
      conv: {
        model: conv?.model, temperature: conv?.temperature, maxTokens: conv?.maxTokens,
        messages: conv?.messages?.map(({ role, content }) => ({ role, content })) || [],
      },
    }
    const result = await new Function('ctx', `return (async () => {\n${tool.code}\n})()`)(ctx)
    await workspace.saveTexts()
    return stringifyResult(result)
  } catch (error) {
    toast.error(`工具“${name}”执行失败: ${error.message}`)
    return `执行错误: ${error.message}`
  }
}

async function callDirectLLMStream(apiConfig, request, submit, options = {}) {
  const mirror = await submit(apiConfig, request, { signal: options.signal, onChunk: options.onChunk, source: 'chat' })
  await mirror.result
  return { content: mirror.responseText, rawContent: mirror.responseText, cot: null, thoughts: [] }
}

async function runDirectAgentLoop(workspace, conv, controller, submit) {
  const resolve = name => workspace.textByName(name)
  const system = [toolPrompt(workspace.tools), expandTextMentions(conv.sysPrompt, resolve)].filter(Boolean).join('\n\n')
  const base = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...conv.messages.map(({ role, content }) => ({ role, content: role === 'user' ? expandTextMentions(content, resolve) : content })),
  ]
  const toolMessages = []
  const apiConfig = resolveApiConfig(workspace)
  for (let attempt = 0; attempt < 5; attempt++) {
    const index = conv.messages.length
    conv.messages.push({ role: 'assistant', content: '', rawContent: '', cot: null, thoughts: [], temp: false })
    const response = await callDirectLLMStream(apiConfig, createChatJobRequest([...base, ...toolMessages], requestConfig(workspace)), submit, {
      signal: controller.signal,
      onChunk(update) { Object.assign(conv.messages[index], update) },
    })
    Object.assign(conv.messages[index], response)
    const call = parseToolCall(response.content)
    if (!call) break
    const message = conv.messages[index]
    message.content = `调用工具: ${call.name}`
    message.toolCall = call
    message.toolResult = await executeTool(workspace, call.name, call.args)
    toolMessages.push({ role: 'assistant', content: response.content }, { role: 'user', content: `[工具 ${call.name} 结果]\n${message.toolResult}` })
  }
}

// --- Send message ---

async function sendMessage(workspace, socket, submit, text) {
  if (!text || workspace.ui.loading || workspace.ui.historyEditing) return
  let conv = workspace.activeConv
  if (!conv) {
    conv = { id: workspace.genId(), name: `对话 ${workspace.conversations.length + 1}`, messages: [], ...workspace.DEFAULTS, apiKeyId: workspace.defaultApiKeyId?.() || workspace.DEFAULTS.apiKeyId }
    workspace.conversations.push(conv)
    workspace.activeId = conv.id
  }
  const apiConfig = resolveApiConfig(workspace)
  if (apiConfig.mode !== 'direct') {
    // Proxy jobs are server-owned, but the chat surface is client-owned. Add
    // the turn immediately so ChatView has an assistant target for Job deltas
    // before the first server snapshot arrives.
    conv.messages ||= []
    conv.messages.push({ role: 'user', content: text })
    conv.messages.push({ role: 'assistant', content: '', rawContent: '', cot: null, thoughts: [], temp: true })
    workspace.ui.loading = true
    workspace.ui.runningConvIds = [...new Set([...workspace.ui.runningConvIds, conv.id])]
    return socket.send(conv.id, text)
  }
  workspace.ui.loading = true
  const controller = new AbortController()
  workspace.ui.abortController = controller
  conv.messages.push({ role: 'user', content: text })
  try {
    await runDirectAgentLoop(workspace, conv, controller, submit)
    await workspace.saveConvs()
  } finally {
    workspace.ui.loading = false
    workspace.ui.abortController = null
  }
}

// --- Workflow ---

async function wfRunPrompt(workspace, options) {
  try {
    const resolve = name => workspace.textByName(name)
    const sysPrompt = options.sysPrompt || workspace.activeConv?.sysPrompt || workspace.DEFAULTS.sysPrompt
    const request = createWorkflowPromptJobRequest({ system: expandTextMentions(sysPrompt, resolve), prompt: options.prompt, config: requestConfig(workspace, options) })
    const json = await callLLM(workspace, request, { ...options, source: 'workflow' })
    dispatch(options.nodeId, json.choices?.[0]?.message?.content || '')
  } catch (error) { dispatch(options.nodeId, null, error.message) }
}

async function wfRunTool(workspace, toolName, args, nodeId) {
  dispatch(nodeId, await executeTool(workspace, toolName, args))
}

async function talkRunStage(workspace, talk, stage, context, runtime) {
  const request = createTalkStageJobRequest(stage, context, talk.modelConfig)
  const apiConfig = resolveApiConfig(workspace, { apiKeyId: talk.modelConfig?.apiKeyId })
  const mirror = await runtime.submit(apiConfig, request, { source: 'talk' })
  return mirror.result
}

// --- AI generation ---

async function generateHighlightRules(workspace, text, runtime) {
  const request = createHighlightRulesJobRequest(text, requestConfig(workspace, { model: 'deepseek-chat', temperature: 0.4, maxTokens: 2048 }))
  const json = await callLLM(workspace, request, { source: 'highlight-rules', submit: runtime.submit })
  const rules = json.validatedOutput
  if (!rules.scopes?.root?.patterns) throw new Error('规则格式不正确，缺少 scopes.root.patterns')
  return rules
}

async function aiWriteTool(workspace, draft, runtime) {
  draft.aiWriting = true
  try {
    const request = createToolWriterJobRequest(draft, requestConfig(workspace, { temperature: 0.3, maxTokens: 2048 }))
    const json = await callLLM(workspace, request, { source: 'tool-writer', submit: runtime.submit })
    draft.code = (json.choices?.[0]?.message?.content || '').replace(/^```(?:js|javascript)?\s*\n?|```$/g, '').trim()
    draft.desc ||= draft.name || 'AI 生成'
  } finally { draft.aiWriting = false }
}

async function aiWritePreset(workspace, draft, description, runtime) {
  const request = createPresetWriterJobRequest(description, requestConfig(workspace, { temperature: 0.6, maxTokens: 4096 }))
  const json = await callLLM(workspace, request, { source: 'preset-writer', submit: runtime.submit })
  const data = json.validatedOutput
  draft.name = data.name || draft.name
  draft.content = data.prompt || draft.content
  draft.temperature = data.temperature !== undefined ? String(data.temperature) : draft.temperature
  draft.maxTokens = data.maxTokens !== undefined ? String(data.maxTokens) : draft.maxTokens
}

async function aiWriteTalk(workspace, draft, description, apiKeyId, runtime) {
  const request = createTalkWriterJobRequest(description, requestConfig(workspace, { temperature: 0.7, maxTokens: 2048 }))
  const json = await callLLM(workspace, request, { apiKeyId, source: 'talk-writer', submit: runtime.submit })
  const data = json.validatedOutput
  draft.name = data.name || draft.name
  draft.persona = data.persona || draft.persona
}

// --- Public API ---

export function createClient(workspace, ui) {
  const mirrors = createJobMirrorRegistry(workspace)
  workspace.jobManager = mirrors
  const conversationSocket = createConversationSocket(workspace, ui, mirrors)
  async function submitJob(apiConfig, request, options = {}) {
    const mirror = apiConfig.mode === 'direct'
      ? createLocalJobMirror(apiConfig, request, mirrors, options)
      : createRemoteJobMirror(apiConfig, request, mirrors, options)
    const resolved = await mirror
    if (apiConfig.mode === 'proxy') resolved.cancel = () => conversationSocket.stopJob(resolved.id)
    return resolved
  }
  return {
    submitJob,
    send: text => sendMessage(workspace, conversationSocket, submitJob, text),
    stopGenerating: () => workspace.ui.abortController?.abort() || conversationSocket.stop(workspace.activeId),
    close: () => conversationSocket.close(),
    syncConversations: () => conversationSocket.sync(),
    syncJobs: () => conversationSocket.syncJobs(),
    wfRunPrompt: options => wfRunPrompt(workspace, { ...options, submit: submitJob }),
    wfRunTool: ({ toolName, args, nodeId }) => wfRunTool(workspace, toolName, args, nodeId),
    talkRunStage: (talk, stage, context) => talkRunStage(workspace, talk, stage, context, { submit: submitJob }),
    generateHighlightRules: text => generateHighlightRules(workspace, text, { submit: submitJob }),
    aiWriteTool: draft => aiWriteTool(workspace, draft, { submit: submitJob }),
    aiWritePreset: (draft, description) => aiWritePreset(workspace, draft, description, { submit: submitJob }),
    aiWriteTalk: (draft, description, apiKeyId) => aiWriteTalk(workspace, draft, description, apiKeyId, { submit: submitJob }),
  }
}
