const resourceTypes = ['text', 'preset', 'tool']

function createResource(type) {
  const id = `${type}-${Date.now()}`
  if (type === 'preset') return { id, name: '新预设', content: '', temperature: '0.7', maxTokens: '4096' }
  if (type === 'tool') return { id, name: '新工具', content: '', description: '' }
  return { id, name: '新文本', content: '' }
}

export class ResourceApplication {
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

  sync() {
    this.workspace.state.set(this.stateKey, {
      text: this.text,
      preset: this.preset,
      tool: this.tool,
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
}
