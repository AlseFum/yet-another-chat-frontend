import { JobRequest, createRetrier, createSchemaValidator } from '../../../../llm/index.js'

export function createResourceJobRequest({ type, resource }, customSetting = {}) {
  if (type === 'highlight') {
    const template = String(customSetting.generateHighlightPrompt || '').trim()
    const instruction = interpolate(template, resource)
    return new JobRequest({
      model: 'deepseek-chat',
      temperature: customSetting.generateTemperature ?? 0.7,
      maxTokens: customSetting.generateMaxTokens ?? 4096,
      thinking: false,
      stream: true,
      messages: [{ role: 'user', content: instruction }],
      validator: createSchemaValidator({
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['pattern', 'className'],
          properties: {
            pattern: { type: 'string', minLength: 1 },
            className: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            enabled: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      }),
      retrier: createRetrier(2),
    })
  }
  const promptKey = `generate${type[0].toUpperCase()}${type.slice(1)}Prompt`
  const template = String(customSetting[promptKey] || '').trim()
  const instruction = interpolate(template, resource)
  return new JobRequest({ model: 'deepseek-chat', temperature: customSetting.generateTemperature ?? 0.7, maxTokens: customSetting.generateMaxTokens ?? 4096, thinking: false, stream: true, messages: [{ role: 'user', content: instruction }] })
}

function interpolate(template, resource) {
  const values = {
    name: resource.name || '',
    functionName: functionName(resource.name),
    content: resource.content || '',
    description: resource.description || '',
    args: resource.args || '',
    globals: 'fetch, signal, workspace, job, resources, logger',
    temperature: resource.temperature || '',
    maxTokens: resource.maxTokens || '',
  }
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key) => values[key] ?? '')
}

function functionName(value) {
  const name = String(value || 'tool').normalize('NFKC').replace(/[^\p{ID_Continue}$]/gu, '_')
  return /^[\p{ID_Start}$_]/u.test(name) ? name : `_${name}`
}
