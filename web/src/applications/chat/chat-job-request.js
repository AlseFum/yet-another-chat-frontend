import { JobRequest } from '../../../../llm/index.js'

export function createChatJobRequest({ messages }, customSetting = {}) {
  const prompt = String(customSetting.injectedPrompt || '').trim()
  const requestMessages = customSetting.useInjectedPrompt && prompt
    ? [{ role: 'system', content: prompt }, ...messages]
    : messages

  return new JobRequest({
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 4096,
    thinking: true,
    stream: true,
    messages: requestMessages,
  })
}
