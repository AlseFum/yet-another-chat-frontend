import { JobRequest } from '../../../../llm/index.js'

export function createWorkflowPromptJobRequest({ prompt, systemPrompt = '', requestOptions = {} }, customSetting = {}) {
  const injected = customSetting.useInjectedPrompt && String(customSetting.injectedPrompt || '').trim()
    ? String(customSetting.injectedPrompt).trim() : ''
  return new JobRequest({
    ...requestOptions,
    messages: [injected, systemPrompt].filter(Boolean).map(content => ({ role: 'system', content })).concat({ role: 'user', content: prompt }),
  })
}
