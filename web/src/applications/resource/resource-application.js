import { createResourceJobRequest } from './resource-job-request.js'
import { isRecord, matchTag } from '../../../../util/match.js'
import { normalizePersona } from './persona-resource.js'

const resourceTypes = ['text', 'preset', 'tool', 'persona']
const copy = value => JSON.parse(JSON.stringify(value))

function createResource(type) {
  const id = `${type}-${Date.now()}`
  return matchTag(type, {
    text: () => ({ id, name: '新文本', content: '', highlights: [] }),
    preset: () => ({ id, name: '新预设', content: '', temperature: '0.7', maxTokens: '4096' }),
    tool: () => ({ id, name: '新工具', content: '', description: '', args: '' }),
    persona: () => ({ id, name: '新 Persona', sections: [['身份', '']], orchestrator: { summary: '', actions: [] } }),
  })()
}

export class ResourceApplication {
  static schema() {
    return {
      autoSave: { type: 'boolean', label: '自动保存资源', description: '编辑 Text、Preset、Tool、Persona 后自动保存到当前 Workspace。', default: true },
      generateTextPrompt: { type: 'textarea', label: 'Text 生成 Prompt', variables: ['name', 'content'], default: '请根据以下名称和已有内容，生成一份可直接使用的文本。名称：{{name}}\n已有内容：{{content}}\n只输出文本内容，不要添加解释。' },
      generateHighlightPrompt: { type: 'textarea', label: '高亮规则生成 Prompt', variables: ['name', 'content'], default: '请分析以下文本，生成需要高亮的关键词或模式。只返回 JSON 数组，每项包含 pattern、className、description。文本名称：{{name}}\n文本内容：{{content}}' },
      generatePresetPrompt: { type: 'textarea', label: 'Preset 生成 Prompt', variables: ['name', 'content', 'temperature', 'maxTokens'], default: '请根据以下预设信息，生成一份可直接使用的系统提示词。名称：{{name}}\n已有内容：{{content}}\nTemperature：{{temperature}}\nMax tokens：{{maxTokens}}\n只输出提示词内容，不要添加解释。' },
      generateToolPrompt: { type: 'textarea', label: 'Tool 生成 Prompt', variables: ['name', 'functionName', 'description', 'args', 'globals', 'content'], default: '请根据以下工具信息，生成 async function {{functionName}}(ctx) { } 内部的 JavaScript 函数体。使用 ctx.args 读取调用参数。fetch、signal、workspace、job、resources、logger 都是 ctx 的属性，必须写成 ctx.fetch、ctx.signal、ctx.workspace、ctx.job、ctx.resources、ctx.logger；记录日志使用 ctx.logger.log(...)。函数体必须使用 return 返回可 JSON 序列化的执行结果，供 Workflow 下游节点消费。只输出函数体纯文本，不要输出函数声明、前后缀、Markdown 代码围栏或解释。\n名称：{{name}}\n描述：{{description}}\nargs：{{args}}\n可用 ctx 属性：{{globals}}\n已有代码：{{content}}' },
      generatePersonaPrompt: { type: 'textarea', label: 'Persona 生成 Prompt', variables: ['prompt', 'name', 'sections', 'textResources', 'sectionSelectors'], default: '请根据用户本次需求，为 Persona 设计或改写一组结构化 Prompt sections。\n用户本次需求：{{prompt}}\nPersona 名称：{{name}}\n已有 sections：{{sections}}\n可引用的 Text Resources：{{textResources}}\n可用 section selector：{{sectionSelectors}}\n\n只返回 JSON 对象，格式为 {"sections":[["sectionName","item 1","item 2"]]}。Section 表示身份、目标、原则、能力、交流方式等主题维度，不代表单独一句话；不要机械地为每句话创建一个 Section。将同一主题的相关要求归入同一个 Section，通常只需 3 至 8 个 Section；只有在内容确实独立时才拆分 Item。每个 Section 必须有非空标题和至少一个非空内容 Item，禁止生成空标题、空 Section 或占位 Section。每个 Section 第一项是简短标题，后续项是内联 Prompt 文本或完整的 @textResourceId 引用。Selector 只能位于 SectionName 最开头，绝不能写进内容 Item；场景不同的要求必须拆成独立 Section。正确示例：["[chat]交流方式","直接回应用户。"]、["[talk:private]交流方式","更坦率地讨论分歧。"]。错误示例：["交流方式","在[chat]中直接回应用户。","在[talk:private]中更坦率。"]。无 selector 的 Section 在 Chat 和 Talk 中通用；[chat] 仅用于 Chat；[talk:private] 仅用于 Persona 自身的 Talk Prompt；[talk:public] 可向 Talk 的其他参与者展示。只能引用上述 Text Resource ID，不要虚构引用。不要返回 id、name、Markdown 代码围栏或解释。' },
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
    this.persona = []
    this.ui = { activeType: 'text' }
  }

  revive(workspace) {
    this.workspace = workspace
    const state = workspace.state.get(this.stateKey, {})
    for (const type of resourceTypes) this[type] = Array.isArray(state[type]) ? state[type] : []
    this.persona = this.persona.map(normalizePersona)
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
    if (!isRecord(patch)) throw new TypeError('Resource patch 必须是对象')
    const resource = this[type]?.find(item => item.id === resourceId)
    if (!resource) throw new Error(`找不到 Resource ${type}:${resourceId}`)
    Object.assign(resource, copy(patch), { id: resource.id })
    if (type === 'persona') Object.assign(resource, normalizePersona(resource))
    await this.save()
    return copy(resource)
  }

  async replace(type, resourceId, value) {
    if (!isRecord(value)) throw new TypeError('Resource 必须是对象')
    const index = this[type]?.findIndex(item => item.id === resourceId) ?? -1
    if (index < 0) throw new Error(`找不到 Resource ${type}:${resourceId}`)
    this[type][index] = type === 'persona' ? normalizePersona({ ...copy(value), id: resourceId }) : { ...copy(value), id: resourceId }
    await this.save()
    return copy(this[type][index])
  }

  sync() {
    this.workspace.state.set(this.stateKey, {
      text: this.text.map(({ generating, ...resource }) => resource),
      preset: this.preset.map(({ generating, ...resource }) => resource),
      tool: this.tool.map(({ generating, ...resource }) => resource),
      persona: this.persona.map(({ generating, ...resource }) => resource),
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

  async generate(type, resource, prompt = '') {
    if (!resourceTypes.includes(type)) throw new Error(`不支持的 Resource 类型 ${type}`)
    const keyRef = this.workspace.selectedKeyRef()
    if (!keyRef) throw new Error('请先在设置或 API Key 页面选择凭据')
    const settings = this.workspace.getCustomSettings(this.id)
    const specialized = matchTag(type, {
      persona: () => this.generatePersona(resource, prompt, settings, keyRef),
      tool: () => this.generateTool(resource, settings, keyRef),
    }, () => null)()
    if (specialized) return specialized
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

  async generateTool(resource, settings, keyRef) {
    const request = createResourceJobRequest({ type: 'tool', resource: copy(resource) }, settings)
    const previousContent = resource.content
    resource.generating = true
    await this.save()
    try {
      const content = await new Promise((resolve, reject) => {
        let job = null
        let settled = false
        const finish = (callback, value) => { if (settled) return; settled = true; callback(value) }
        const validate = (value, rawText = '') => {
          const result = typeof value === 'string' && value ? request.validate(value) : request.validate(rawText || job?.responseText || '')
          if (!result.ok) return finish(reject, new Error(`Tool 生成结果校验失败：${result.errors.join('；')}`))
          finish(resolve, result.value)
        }
        this.workspace.createJob({
          request,
          keyRef,
          metadata: { source: `resource:${resource.name}`, resourceType: 'tool', resourceId: resource.id },
          onEvent: event => {
            if (event.type === 'result') validate(event.value, event.rawText)
            if (event.type === 'state' && ['failed', 'cancelled'].includes(event.state)) finish(reject, new Error(`Tool 生成${event.state === 'cancelled' ? '已取消' : '失败'}`))
            if (event.type === 'state' && event.state === 'completed' && job?.responseText) validate(job.value, job.responseText)
          },
        }).then(created => { job = created; if (job.status === 'completed') validate(job.value, job.responseText) }).catch(error => finish(reject, error))
      })
      resource.content = content
      resource.generating = false
      await this.save()
    } catch (error) {
      resource.content = previousContent
      resource.generating = false
      await this.save()
      throw error
    }
  }

  async generatePersona(resource, prompt, settings, keyRef) {
    if (!String(prompt || '').trim()) throw new TypeError('请输入本次 Persona 生成需求')
    const input = { ...copy(resource), prompt: String(prompt).trim(), textResources: this.text.map(({ id, name }) => ({ id, name })) }
    const request = createResourceJobRequest({ type: 'persona', resource: input }, settings)
    resource.generating = true
    await this.save()
    try {
      await new Promise((resolve, reject) => {
        let job = null
        let settled = false
        let pollTimer = null
        const timeout = globalThis.setTimeout(() => fail(new Error('Persona 生成超时，请检查 Job 记录或 API 状态')), 120000)
        const cleanup = () => {
          globalThis.clearTimeout(timeout)
          globalThis.clearTimeout(pollTimer)
        }
        const fail = error => {
          if (settled) return
          settled = true
          cleanup()
          reject(error)
        }
        const finish = (value, rawText = '') => {
          if (settled) return
          const validation = Array.isArray(value?.sections)
            ? { ok: true, value }
            : request.validate(rawText)
          if (!validation.ok) {
            fail(new Error(`Persona 生成结果校验失败：${validation.errors.join('；')}`))
            return
          }
          settled = true
          cleanup()
          const currentResource = this.persona.find(item => item.id === resource.id) || resource
          currentResource.sections = copy(validation.value.sections)
          resolve()
        }
        const inspectJob = currentJob => {
          if (!currentJob) return false
          if (currentJob.status === 'completed') {
            finish(currentJob.value, currentJob.responseText || '')
            return true
          }
          if (currentJob.status === 'failed' || currentJob.status === 'cancelled') {
            fail(new Error(`Persona 生成${currentJob.status === 'cancelled' ? '已取消' : `失败${currentJob.error ? `：${currentJob.error}` : ''}`}`))
            return true
          }
          return false
        }
        const poll = async () => {
          if (settled || !job || this.workspace.jobsManager.source(job.id) === 'direct') return
          try {
            const response = await this.workspace.transport.loadJobs([job.id], { detail: true })
            const current = response.jobs?.[0]
            if (current) {
              job = { ...job, ...current }
              this.workspace.jobsManager.applyServerEvent({ job: current, event: null })
            }
            if (!inspectJob(current)) pollTimer = globalThis.setTimeout(poll, 500)
          } catch {
            if (!settled) pollTimer = globalThis.setTimeout(poll, 1000)
          }
        }
        const onEvent = event => {
          if (event.type === 'result') {
            const value = event.value || job?.value
            const rawText = event.rawText || job?.responseText || ''
            if (value || rawText) finish(value, rawText)
            return
          }
          if (event.type !== 'state') return
          if (event.state === 'completed') return inspectJob(job)
          if (['failed', 'cancelled'].includes(event.state)) {
            fail(new Error(`Persona 生成${event.state === 'cancelled' ? '已取消' : `失败${job?.error ? `：${job.error}` : ''}`}`))
          }
        }
        this.workspace.createJob({
          request,
          keyRef,
          metadata: { source: `resource:${resource.name}`, resourceType: 'persona', resourceId: resource.id },
          onEvent,
        }).then(createdJob => { job = createdJob; if (!inspectJob(job)) void poll() }).catch(fail)
      })
      const currentResource = this.persona.find(item => item.id === resource.id) || resource
      currentResource.generating = false
      await this.save()
    } catch (error) {
      const currentResource = this.persona.find(item => item.id === resource.id) || resource
      currentResource.generating = false
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
