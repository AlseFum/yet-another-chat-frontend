import { JobRequest, createRetrier, createSchemaValidator } from '../../../../llm/index.js'
import { validatePersona } from './persona-resource.js'
import { matchTag } from '../../../../util/match.js'

export function createResourceJobRequest({ type, resource }, customSetting = {}) {
  return matchTag(type, {
    persona: () => createPersonaJobRequest(resource, customSetting),
    tool: () => createToolJobRequest(resource, customSetting),
    highlight: () => {
    const template = String(customSetting.generateHighlightPrompt || '').trim()
    const instruction = interpolate(template, resource)
    return new JobRequest({
      model: 'deepseek-v4-flash',
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
    },
    text: () => createPlainResourceJobRequest('text', resource, customSetting),
    preset: () => createPlainResourceJobRequest('preset', resource, customSetting),
  }, () => { throw new TypeError(`不支持的 Resource Job 类型 ${type}`) })()
}

function createPlainResourceJobRequest(type, resource, customSetting) {
  const promptKey = `generate${type[0].toUpperCase()}${type.slice(1)}Prompt`
  const template = String(customSetting[promptKey] || '').trim()
  const instruction = interpolate(template, resource)
  return new JobRequest({ model: 'deepseek-v4-flash', temperature: customSetting.generateTemperature ?? 0.7, maxTokens: customSetting.generateMaxTokens ?? 4096, thinking: false, stream: true, messages: [{ role: 'user', content: instruction }] })
}

export function normalizeToolBody(text) {
  let body = String(text || '').trim()
  const fenced = /^```(?:javascript|js)?\s*\n?([\s\S]*?)\n?```$/i.exec(body)
  if (fenced) body = fenced[1].trim()
  return body
}

export function validateToolBody(text) {
  const body = normalizeToolBody(text)
  const errors = []
  if (!body) errors.push('Tool 函数体不能为空')
  if (/\b(?:async\s+)?function\s+[\p{ID_Continue}$]*\s*\(/u.test(body) || /^\s*(?:async\s*)?\([^)]*\)\s*=>/u.test(body)) errors.push('只允许返回函数体，不能包含 function 声明或箭头函数外壳')
  if (!/\breturn\s+(?:await\s+)?(?![;}\n])/u.test(body)) errors.push('Tool 函数体必须使用 return 返回可供下游节点消费的结果')
  if (!errors.length) {
    try { new Function(`return async function(ctx) {\n${body}\n}`) } catch (error) { errors.push(`Tool JavaScript 语法错误：${error.message}`) }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: body }
}

function createToolJobRequest(resource, customSetting) {
  const template = String(customSetting.generateToolPrompt || '').trim()
  const instruction = `${interpolate(template, resource)}\n\n严格要求：只输出函数体纯文本，不要 Markdown 代码围栏，不要输出 function 声明。所有能力都必须通过 ctx 访问，例如 ctx.args、ctx.fetch、ctx.signal、ctx.workspace、ctx.job、ctx.resources、ctx.logger.log。函数体最后必须使用 return 返回可 JSON 序列化的结果，供 Workflow 下游节点消费。`
  return new JobRequest({
    model: 'deepseek-v4-flash',
    temperature: customSetting.generateTemperature ?? 0.7,
    maxTokens: customSetting.generateMaxTokens ?? 4096,
    thinking: false,
    stream: true,
    messages: [{ role: 'user', content: instruction }],
    validator: validateToolBody,
    retrier: createRetrier(2),
  })
}

function createPersonaJobRequest(resource, customSetting) {
  const template = String(customSetting.generatePersonaPrompt || '').trim()
  const instruction = buildPersonaInstruction(template, resource)
  const schemaValidator = createSchemaValidator({
    type: 'object',
    required: ['sections'],
    properties: {
      sections: {
        type: 'array',
        minItems: 1,
        maxItems: 30,
        items: {
          type: 'array',
          minItems: 2,
          maxItems: 30,
          items: { type: 'string', maxLength: 12000 },
        },
      },
    },
    additionalProperties: false,
  })
  const validator = text => {
    const result = schemaValidator(text)
    if (!result.ok) return result
    const sections = result.value.sections
      .filter(section => typeof section[0] === 'string' && section[0].trim())
      .map(section => [section[0], ...section.slice(1).filter(item => item.trim())])
    if (!sections.length) return { ok: false, errors: ['Persona 至少需要一个非空标题的 section'] }
    const value = { ...result.value, sections }
    const issues = validatePersona({ id: resource.id, name: resource.name, sections, orchestrator: resource.orchestrator }, new Set((resource.textResources || []).map(item => item.id)))
    return issues.length ? { ok: false, errors: issues.map(issue => issue.message) } : { ok: true, value }
  }
  return new JobRequest({
    model: 'deepseek-v4-flash',
    temperature: customSetting.generateTemperature ?? 0.7,
    maxTokens: customSetting.generateMaxTokens ?? 4096,
    thinking: false,
    stream: true,
    messages: [{ role: 'user', content: instruction }],
    validator,
    retrier: createRetrier(2),
  })
}

function buildPersonaInstruction(template, resource) {
  const rendered = interpolate(template, resource)
  const prompt = template.includes('{{prompt}}') ? '' : `\n\n本次用户生成需求：\n${resource.prompt || ''}`
  return `${rendered}${prompt}\n\n严格规则：section selector 只允许 [chat]、[talk:private]、[talk:public]，并且只能出现在 sectionName 的最开头。selector 是结构元数据，任何内容 item 中都禁止出现 [chat]、[talk:private]、[talk:public]，也不要写“在 Chat 中”“在 Talk 私下交流中”之类的场景说明。场景不同的内容必须拆成独立 section，例如正确格式是 ["[chat]交流方式","直接回应用户。"]、["[talk:private]交流方式","更坦率地讨论分歧。"]；错误格式是 ["交流方式","在[chat]中直接回应用户。","在[talk:private]中更坦率。"]。禁止生成 [talk]，禁止使用任何冒号后缀 selector。每个 section 必须有非空标题和至少一个非空内容 item，禁止输出空标题、空 section 或占位 section。已有 sections 如果包含错误的正文 selector，必须在输出时拆分并改正。`.trim()
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
    sections: JSON.stringify(resource.sections || [], null, 2),
    textResources: JSON.stringify(resource.textResources || [], null, 2),
    sectionSelectors: '[chat], [talk:private], [talk:public]',
    prompt: resource.prompt || '',
  }
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, key) => values[key] ?? '')
}

function functionName(value) {
  const name = String(value || 'tool').normalize('NFKC').replace(/[^\p{ID_Continue}$]/gu, '_')
  return /^[\p{ID_Start}$_]/u.test(name) ? name : `_${name}`
}
