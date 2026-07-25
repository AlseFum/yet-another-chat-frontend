import { JobRequest, createJSONValidator, createRepairRetrier, createSchemaValidator } from './job-request.js'
import { buildStageMessages, talkStageSchema } from './prompts/talk.js'

/**
 * Job factories translate application intents into executable JobRequests.
 * They do not execute requests or depend on Vue, storage, or a provider.
 */
// --- Plain-text jobs ---

export function createChatJobRequest(messages, config = {}) {
  return new JobRequest({ messages, ...config })
}

export function createWorkflowPromptJobRequest({ system, prompt, config = {} }) {
  return new JobRequest({ messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], ...config })
}

// --- Structured Talk jobs ---

export function createTalkStageJobRequest(stage, context, config = {}) {
  const schema = talkStageSchema(stage)
  return new JobRequest({
    messages: buildStageMessages(stage, context, schema),
    model: config.model || 'deepseek-v4-flash',
    temperature: config.temperature || '0.7',
    maxTokens: config.maxTokens || '2048',
    strictSchema: schema,
    validator: createSchemaValidator(schema),
    retrier: createRepairRetrier(3),
  })
}

// --- Structured generation jobs ---

export function createHighlightRulesJobRequest(text, config = {}) {
  return new JobRequest({
    messages: [
      { role: 'system', content: 'Return only JSON syntax-highlight rules with scopes.root.patterns.' },
      { role: 'user', content: text },
    ],
    model: config.model || 'deepseek-chat', temperature: config.temperature ?? 0.4, maxTokens: config.maxTokens || 2048,
    validator: createJSONValidator(), retrier: createRepairRetrier(2),
  })
}

export function createToolWriterJobRequest(draft, config = {}) {
  return new JobRequest({
    messages: [
      { role: 'system', content: '你是 JavaScript 工具函数生成器。只输出 async function 工具函数体内的可运行代码，不要输出函数签名、外层花括号、Markdown 代码块或说明文字。函数已由运行环境包装为 async function toolName(ctx)，可使用 ctx.args、ctx.fetch、ctx.texts、ctx.conv。' },
      { role: 'user', content: `工具名: ${draft.name || '(未命名)'}\n描述: ${draft.desc || '(无)'}\n当前函数体：\n${draft.code}` },
    ],
    ...config,
  })
}

export function createPresetWriterJobRequest(description, config = {}) {
  return new JobRequest({
    messages: [
      { role: 'system', content: '根据描述输出JSON：name、prompt、temperature、maxTokens。只输出JSON。' },
      { role: 'user', content: description },
    ],
    temperature: config.temperature ?? 0.6, maxTokens: config.maxTokens || 4096, model: config.model,
    validator: createJSONValidator(), retrier: createRepairRetrier(2),
  })
}

export function createTalkWriterJobRequest(description, config = {}) {
  return new JobRequest({
    messages: [
      { role: 'system', content: '根据描述设计一个长期 Talk 角色。只输出 JSON：name、persona。persona 应明确角色身份、性格、表达方式、背景、与用户关系的边界，且不得包含提示词、内部推理或需要角色执行的具体计划。' },
      { role: 'user', content: description },
    ],
    temperature: config.temperature ?? 0.7, maxTokens: config.maxTokens || 2048, model: config.model,
    validator: createJSONValidator(), retrier: createRepairRetrier(2),
  })
}
