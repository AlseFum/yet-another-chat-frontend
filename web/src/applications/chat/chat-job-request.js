import { JobRequest } from '../../../../llm/index.js'

export function createChatJobRequest({ messages, personaPrompts = [], activePersonaId = null, systemPrompt = '' }, customSetting = {}) {
  const prompt = String(customSetting.injectedPrompt || '').trim()
  const orderedPersonaPrompts = [...personaPrompts].sort((left, right) => Number(left.personaId === activePersonaId) - Number(right.personaId === activePersonaId))
  const systemMessages = orderedPersonaPrompts.map(item => ({ role: 'system', content: item.content }))
  if (systemPrompt) systemMessages.unshift({ role: 'system', content: systemPrompt })
  if (customSetting.useInjectedPrompt && prompt) systemMessages.unshift({ role: 'system', content: prompt })
  const requestMessages = [...systemMessages, ...messages]

  return new JobRequest({
    model: customSetting.requestOptions?.model || customSetting.model || 'deepseek-chat',
    temperature: customSetting.requestOptions?.temperature ?? 0.7,
    maxTokens: customSetting.requestOptions?.maxTokens ?? 4096,
    thinking: customSetting.requestOptions?.thinking ?? true,
    stream: customSetting.requestOptions?.stream ?? true,
    messages: requestMessages,
  })
}
