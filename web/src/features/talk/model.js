const now = () => new Date().toISOString()

export function createTalk({ id, name, persona, apiKeyId }) {
  return {
    id,
    name: name.trim(),
    persona: { content: persona.trim(), createdAt: now() },
    modelConfig: { apiKeyId: apiKeyId || '', model: 'deepseek-v4-flash', temperature: '0.7', maxTokens: '2048' },
    activity: { enabled: true, minReplyIntervalMinutes: 60, maxProactivePerSession: 2 },
    sessions: [],
    createdAt: now(),
  }
}

export function createSession({ id, name }) {
  const startedAt = now()
  return {
    id,
    name: name.trim() || '新的时段',
    clock: {
      anchorRealAt: startedAt,
      anchorSessionAt: startedAt,
      offsetMs: 0,
      rate: 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    },
    state: '暂无客观状态记录。',
    memory: [],
    plans: [],
    conversation: [],
    events: [],
    runtimeLog: [],
    lastProcessedAt: startedAt,
    lastContactAt: null,
    nextCheckAt: null,
    createdAt: startedAt,
  }
}

export function createPlan({ id, action, scheduledAt }) {
  return {
    id,
    action: action.trim(),
    scheduledAt,
    expiresAt: null,
    stateEffect: '',
    contactIntent: 'consider',
    status: 'pending',
    processedAt: null,
  }
}

export function createConversationMessage({ id, role, content }) {
  return { id, role, content: content.trim(), createdAt: now() }
}
