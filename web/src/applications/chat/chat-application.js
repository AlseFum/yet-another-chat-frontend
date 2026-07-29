import { JobRequest } from '../../../../llm/index.js'

export class ChatApplication {
  constructor() {
    this.id = 'chat'
    this.stateKey = 'chat'
    this.workspace = null
    this.conversations = []
    this.ui = { activeConversationId: null }
  }

  revive(workspace) {
    this.workspace = workspace
    const state = workspace.state.get(this.stateKey, {})
    this.conversations = Array.isArray(state.conversations) ? state.conversations : []
    this.ui = { activeConversationId: null, ...state.ui }
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

    const request = new JobRequest({
      model: 'deepseek-chat',
      messages: current.messages.filter(message => !message.streaming).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
      thinking: true,
      maxTokens: 4096,
      stream: true,
    })
    try {
      const job = await this.workspace.createJob({
        request,
        keyRef,
        metadata: { source: `chat:${current.name}`, conversationId: current.id },
        onEvent: event => {
          if (event.type === 'delta') {
            assistant.content += event.content || ''
            assistant.reasoning += event.reasoning || ''
          }
          if (event.type === 'result' && event.rawText && !assistant.content) assistant.content = event.rawText
          if (['completed', 'failed', 'cancelled'].includes(event.state)) {
            assistant.streaming = false
            if (event.state !== 'completed' && !assistant.content) assistant.content = event.state === 'cancelled' ? 'Job 已取消。' : 'Job 执行失败。'
            void this.save()
          }
        },
      })
      assistant.jobId = job.id
      return job
    } catch (error) {
      assistant.streaming = false
      assistant.content = `Job 创建失败：${error.message}`
      await this.save()
      throw error
    }
  }
}
