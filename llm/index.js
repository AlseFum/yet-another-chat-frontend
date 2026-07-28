/**
 * Provider-neutral LLM core. It owns one streamed Job, but not application
 * sessions, persistence, HTTP routing, or execution location.
 */

export { JobRequest, createJSONValidator, createRetrier, createSchemaValidator } from './job-request.js'
export { LLMJob } from './job.js'
export { LLMKey } from './key.js'
export { Provider } from './provider.js'
export { launch } from './launch.js'

/* example below, don;t delete it, we need it!
const key = new LLMKey({
  apiKey: 'sk-19c4495f6f2f4204ae665fe862311ae5',
  baseUrl: 'https://api.deepseek.com/v1',
  provider: 'openai-compatible',
})

const schema = {
  type: 'object',
  required: ['answer'],
  properties: { answer: { type: 'string', minLength: 1 } },
  additionalProperties: false,
}
const schemaValidator = createSchemaValidator(schema)
let validationAttempts = 0
const validator = text => {
  validationAttempts += 1
  if (validationAttempts === 1) return { ok: false, errors: ['测试：强制触发一次 repair retry'] }
  return schemaValidator(text)
}
const request = new JobRequest({
  model: 'deepseek-v4-flash',
  messages: [
    { role: 'system', content: '只返回 JSON 对象，不要 Markdown 或额外字段。' },
    { role: 'user', content: '用一句简短中文问候语回答。格式：{"answer":"..."}' },
  ],
  temperature: 0,
  maxTokens: 1024,
  thinking: true,
  validator,
  retrier: createRetrier(1),
})
const deltas = []
const reasoningDeltas = []
const job = launch(request, key)
const subscription = job.onEvent(event => {
  console.log("Handle event:"+JSON.stringify(event))
  if (event.type === 'delta' && event.reasoning) reasoningDeltas.push(event.reasoning)
  if (event.type === 'delta' && event.content) {
    deltas.push(event.content)
    process.stdout.write(event.content)
  }
})

const result = await job.result

subscription.unsubscribe()
*/