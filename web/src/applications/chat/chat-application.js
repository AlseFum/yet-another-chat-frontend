import { createChatJobRequest } from './chat-job-request.js'

export class ChatApplication {
  static schema() {
    return {
      useInjectedPrompt: { type: 'boolean', label: '使用注入 Prompt', default: false },
      injectedPrompt: { type: 'textarea', label: '注入 Prompt', default: '' },
    }
  }

  constructor() {
    this.id = 'chat'
    this.stateKey = 'chat'
    this.workspace = null
    this.conversations = []
    this.ui = { activeConversationId: null }
    this.jobSubscriptions = new Map()
  }

  revive(workspace) {
    this.workspace = workspace
    const state = workspace.state.get(this.stateKey, {})
    this.conversations = Array.isArray(state.conversations) ? state.conversations : []
    this.ui = { activeConversationId: null, ...state.ui }
    this.rebindJobs()
  }

  rebindJobs() {
    const activeJobs = new Set()
    for (const conversation of this.conversations) {
      for (const message of conversation.messages || []) {
        if (!message.jobId || !message.streaming) continue
        const job = this.workspace.jobsManager.get(message.jobId)
        if (!job) continue
        activeJobs.add(message.jobId)
        this.applyJobSnapshot(message, job)
        if (!this.jobSubscriptions.has(message.jobId)) {
          this.jobSubscriptions.set(message.jobId, job.onEvent(event => this.applyJobEvent(message, event)))
        }
      }
    }
    for (const [jobId, subscription] of this.jobSubscriptions) {
      if (!activeJobs.has(jobId)) {
        subscription.unsubscribe()
        this.jobSubscriptions.delete(jobId)
      }
    }
  }

  applyJobSnapshot(message, job) {
    message.content = job.responseText || message.content || ''
    message.reasoning = job.reasoning || message.reasoning || ''
    if (['completed', 'failed', 'cancelled', 'missing'].includes(job.status)) {
      message.streaming = false
      if (job.status !== 'completed' && !message.content) message.content = job.status === 'cancelled' ? 'Job 已取消。' : 'Job 执行失败。'
    }
  }

  applyJobEvent(message, event) {
    if (event.type === 'delta') {
      message.content += event.content || ''
      message.reasoning += event.reasoning || ''
    }
    if (event.type === 'result' && event.rawText && !message.content) message.content = event.rawText
    if (['completed', 'failed', 'cancelled'].includes(event.state)) {
      message.streaming = false
      if (event.state !== 'completed' && !message.content) message.content = event.state === 'cancelled' ? 'Job 已取消。' : 'Job 执行失败。'
      void this.save()
      this.jobSubscriptions.get(message.jobId)?.unsubscribe()
      this.jobSubscriptions.delete(message.jobId)
    }
  }

  init() {
    if (!this.conversations.some(item => item.id === this.ui.activeConversationId)) {
      this.ui.activeConversationId = this.conversations[0]?.id || null
    }
  }

  get activeConversation() {
    return this.conversations.find(item => item.id === this.ui.activeConversationId) || null
  }

  sync() {
    this.workspace.state.set(this.stateKey, {
      conversations: this.conversations,
      ui: { ...this.ui },
    })
  }

  save() {
    this.sync()
    return this.workspace.saveState()
  }

  select(conversationId) {
    if (!this.conversations.some(item => item.id === conversationId)) return
    this.ui.activeConversationId = conversationId
    return this.save()
  }

  create() {
    const conversation = { id: `chat-${Date.now()}`, name: '新对话', messages: [] }
    this.conversations.push(conversation)
    this.ui.activeConversationId = conversation.id
    return conversation
  }

  async remove(conversationId) {
    const index = this.conversations.findIndex(item => item.id === conversationId)
    if (index < 0) return
    const conversation = this.conversations[index]
    for (const message of conversation.messages || []) {
      if (message.jobId && message.streaming) await this.workspace.abortJob(message.jobId)
    }
    this.conversations.splice(index, 1)
    if (this.ui.activeConversationId === conversationId) {
      this.ui.activeConversationId = this.conversations[index]?.id || this.conversations[index - 1]?.id || this.conversations[0]?.id || null
    }
    return this.save()
  }

  async sendMessage(content) {
    const current = this.activeConversation
    const keyRef = this.workspace.selectedKeyRef()
    if (!current) throw new Error('请先创建或选择对话')
    if (!keyRef) throw new Error('请先在设置或 API Key 页面选择凭据')

    const userMessage = { id: `message-${Date.now()}`, role: 'user', content }
    const assistantDraft = { id: `message-${Date.now()}-assistant`, role: 'assistant', content: '', reasoning: '', streaming: true }
    current.messages.push(userMessage, assistantDraft)
    // Chat 挂载后消息数组是响应式的。delta 到达前重新读取插入项，
    // 后续写入才能立即通知 ChatView。
    const assistant = current.messages.at(-1)
    await this.save()

    const request = createChatJobRequest({
      messages: current.messages.filter(message => !message.streaming).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
    }, this.workspace.getCustomSettings(this.id))
    try {
      const job = await this.workspace.createJob({
        request,
        keyRef,
        metadata: { source: `chat:${current.name}`, conversationId: current.id },
        onEvent: event => {
          this.applyJobEvent(assistant, event)
        },
      })
      assistant.jobId = job.id
      await this.save()
      return job
    } catch (error) {
      assistant.streaming = false
      assistant.content = `Job 创建失败：${error.message}`
      await this.save()
      throw error
    }
  }

  close() {
    for (const subscription of this.jobSubscriptions.values()) subscription.unsubscribe()
    this.jobSubscriptions.clear()
  }
}
