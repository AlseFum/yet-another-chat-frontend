import { createResourceJobRequest } from './resource-job-request.js'

const resourceTypes = ['text', 'preset', 'tool']
const copy = value => JSON.parse(JSON.stringify(value))

function createResource(type) {
  const id = `${type}-${Date.now()}`
  if (type === 'preset') return { id, name: '新预设', content: '', temperature: '0.7', maxTokens: '4096' }
  if (type === 'tool') return { id, name: '新工具', content: '', description: '', args: '' }
  return { id, name: '新文本', content: '', highlights: [] }
}

export class ResourceApplication {
  static schema() {
    return {
      autoSave: { type: 'boolean', label: '自动保存资源', description: '编辑 Text、Preset、Tool 后自动保存到当前 Workspace。', default: true },
      generateTextPrompt: { type: 'textarea', label: 'Text 生成 Prompt', variables: ['name', 'content'], default: '请根据以下名称和已有内容，生成一份可直接使用的文本。名称：{{name}}\n已有内容：{{content}}\n只输出文本内容，不要添加解释。' },
      generateHighlightPrompt: { type: 'textarea', label: '高亮规则生成 Prompt', variables: ['name', 'content'], default: '请分析以下文本，生成需要高亮的关键词或模式。只返回 JSON 数组，每项包含 pattern、className、description。文本名称：{{name}}\n文本内容：{{content}}' },
      generatePresetPrompt: { type: 'textarea', label: 'Preset 生成 Prompt', variables: ['name', 'content', 'temperature', 'maxTokens'], default: '请根据以下预设信息，生成一份可直接使用的系统提示词。名称：{{name}}\n已有内容：{{content}}\nTemperature：{{temperature}}\nMax tokens：{{maxTokens}}\n只输出提示词内容，不要添加解释。' },
      generateToolPrompt: { type: 'textarea', label: 'Tool 生成 Prompt', variables: ['name', 'functionName', 'description', 'args', 'globals', 'content'], default: '请根据以下工具信息，生成固定函数体。函数名为 {{functionName}}，调用参数为 ctx。使用 ctx.args 读取调用参数，并可使用列出的全局 ctx 能力。只输出 async function {{functionName}}(ctx) { } 内部的 JavaScript 函数体，不要输出函数声明、前后缀、Markdown 代码围栏或解释。\n名称：{{name}}\n描述：{{description}}\nargs：{{args}}\n全局 ctx：{{globals}}\n已有代码：{{content}}' },
      generateTemperature: { type: 'number', label: '生成 Temperature', default: 0.7, min: 0, max: 2, step: 0.1 },
      generateMaxTokens: { type: 'number', label: '生成 Max tokens', default: 4096, min: 1, step: 1 },
    }
  }

  constructor() {
    this.id = 'resource'
    this.stateKey = 'resource'
    this.workspace = null
    this.text = []
    this.preset = []
    this.tool = []
    this.ui = { activeType: 'text' }
  }

  revive(workspace) {
    this.workspace = workspace
    const state = workspace.state.get(this.stateKey, {})
    for (const type of resourceTypes) this[type] = Array.isArray(state[type]) ? state[type] : []
    this.ui = { activeType: 'text', ...state.ui }
  }

  init() {
    if (!resourceTypes.includes(this.ui.activeType)) this.ui.activeType = 'text'
  }

  get activeType() { return this.ui.activeType }

  list(type) {
    if (!resourceTypes.includes(type)) return []
    return this[type].map(resource => copy(resource))
  }

  get(type, resourceId) {
    if (!resourceTypes.includes(type)) return null
    const resource = this[type].find(item => item.id === resourceId)
    return resource ? copy(resource) : null
  }

  has(type, resourceId) {
    return resourceTypes.includes(type) && this[type].some(resource => resource.id === resourceId)
  }

  async update(type, resourceId, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Resource patch 必须是对象')
    const resource = this[type]?.find(item => item.id === resourceId)
    if (!resource) throw new Error(`找不到 Resource ${type}:${resourceId}`)
    Object.assign(resource, copy(patch), { id: resource.id })
    await this.save()
    return copy(resource)
  }

  async replace(type, resourceId, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Resource 必须是对象')
    const index = this[type]?.findIndex(item => item.id === resourceId) ?? -1
    if (index < 0) throw new Error(`找不到 Resource ${type}:${resourceId}`)
    this[type][index] = { ...copy(value), id: resourceId }
    await this.save()
    return copy(this[type][index])
  }

  sync() {
    this.workspace.state.set(this.stateKey, {
      text: this.text.map(({ generating, ...resource }) => resource),
      preset: this.preset.map(({ generating, ...resource }) => resource),
      tool: this.tool.map(({ generating, ...resource }) => resource),
      ui: { ...this.ui },
    })
  }

  save() {
    this.sync()
    return this.workspace.saveState()
  }

  select(type) {
    if (!resourceTypes.includes(type)) return
    this.ui.activeType = type
    return this.save()
  }

  create(type = this.activeType) {
    if (!resourceTypes.includes(type)) throw new TypeError(`不支持的 Resource 类型 ${type}`)
    const resource = createResource(type)
    this[type].push(resource)
    return resource
  }

  async remove(type, resourceId) {
    if (!resourceTypes.includes(type)) throw new TypeError(`不支持的 Resource 类型 ${type}`)
    const index = this[type].findIndex(resource => resource.id === resourceId)
    if (index < 0) return
    this[type].splice(index, 1)
    return this.save()
  }

  async generate(type, resource) {
    if (!resourceTypes.includes(type)) throw new Error(`不支持的 Resource 类型 ${type}`)
    const keyRef = this.workspace.selectedKeyRef()
    if (!keyRef) throw new Error('请先在设置或 API Key 页面选择凭据')
    const settings = this.workspace.getCustomSettings(this.id)
    const request = createResourceJobRequest({ type, resource }, settings)
    resource.content = ''
    resource.generating = true
    await this.save()
    try {
      await this.workspace.createJob({
        request,
        keyRef,
        metadata: { source: `resource:${resource.name}`, resourceType: type, resourceId: resource.id },
        onEvent: event => {
          if (event.type === 'delta') resource.content += event.content || ''
          if (event.type === 'result' && event.rawText && !resource.content) resource.content = event.rawText
          if (['completed', 'failed', 'cancelled'].includes(event.state)) {
            resource.generating = false
            void this.save()
          }
        },
      })
    } catch (error) {
      resource.generating = false
      await this.save()
      throw error
    }
  }

  async generateHighlights(resource) {
    const keyRef = this.workspace.selectedKeyRef()
    if (!keyRef) throw new Error('请先在设置或 API Key 页面选择凭据')
    const settings = this.workspace.getCustomSettings(this.id)
    const request = createResourceJobRequest({ type: 'highlight', resource }, settings)
    const output = []
    await new Promise((resolve, reject) => {
      const onEvent = event => {
        if (event.type === 'state' && event.state === 'retrying') output.length = 0
        if (event.type === 'delta') output.push(event.content || '')
        if (event.type === 'result' && event.rawText && !output.length) output.push(event.rawText)
        if (event.type === 'state' && event.state === 'completed') resolve()
        if (event.type === 'state' && ['failed', 'cancelled'].includes(event.state)) reject(new Error(`高亮规则生成${event.state === 'cancelled' ? '已取消' : '失败'}`))
      }
      this.workspace.createJob({
        request,
        keyRef,
        metadata: { source: `resource:highlight:${resource.name}`, resourceType: 'highlight', resourceId: resource.id },
        onEvent,
      }).catch(reject)
    })
    try {
      const parsed = JSON.parse(output.join('').replace(/^```json\s*/i, '').replace(/\s*```$/, ''))
      resource.highlights = Array.isArray(parsed)
        ? parsed.map(rule => ({ enabled: true, ...rule }))
          .filter(rule => typeof rule.pattern === 'string' && rule.pattern.length <= 120 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(rule.className || ''))
          .map(rule => ({ color: '', background: '', bold: false, italic: false, underline: false, strikethrough: false, ...rule }))
          .slice(0, 50)
        : []
      await this.save()
    } catch (error) {
      throw new Error(`高亮规则解析失败：${error.message}`)
    }
  }
}
