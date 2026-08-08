export const personaSectionScopes = [
  { value: 'all', label: '通用' },
  { value: 'chat', label: '仅 Chat' },
  { value: 'talk:private', label: 'Talk 私有' },
  { value: 'talk:public', label: 'Talk 公开' },
]

export function normalizePersona(persona = {}) {
  const orchestrator = persona.orchestrator && typeof persona.orchestrator === 'object' && !Array.isArray(persona.orchestrator) ? persona.orchestrator : {}
  return {
    ...persona,
    sections: Array.isArray(persona.sections) ? persona.sections : [],
    orchestrator: {
      ...orchestrator,
      summary: String(orchestrator.summary || ''),
      actions: Array.isArray(orchestrator.actions) ? orchestrator.actions : [],
    },
  }
}

const selectors = new Map([
  ['chat', 'chat'],
  ['talk:private', 'talk:private'],
  ['talk:public', 'talk:public'],
])

export function parsePersonaSectionName(value) {
  const sectionName = String(value || '')
  const match = /^\[([^\]]+)\](.*)$/s.exec(sectionName)
  if (!match) return { scope: 'all', title: sectionName }
  const scope = selectors.get(match[1])
  if (!scope) return { scope: 'invalid', selector: match[1], title: match[2] }
  return { scope, title: match[2] }
}

export function formatPersonaSectionName(scope, title) {
  if (scope === 'all') return String(title || '')
  if (!personaSectionScopes.some(option => option.value === scope)) throw new TypeError(`不支持的 Persona section scope ${scope}`)
  return `[${scope}]${String(title || '')}`
}

export function personaItemReference(item) {
  const value = String(item || '')
  const match = /^@\[([^\]\s@]+)\]$/.exec(value)
  return match ? match[1] : null
}

export function validatePersona(persona, textIds = null) {
  const issues = []
  if (!persona || typeof persona !== 'object') return [{ code: 'INVALID_PERSONA', message: 'Persona 必须是对象' }]
  if (!String(persona.id || '').trim()) issues.push({ code: 'MISSING_ID', message: 'Persona ID 不能为空' })
  if (!String(persona.name || '').trim()) issues.push({ code: 'MISSING_NAME', message: 'Persona 名称不能为空' })
  if (!Array.isArray(persona.sections)) return [...issues, { code: 'INVALID_SECTIONS', message: 'Persona sections 必须是数组' }]

  persona.sections.forEach((section, sectionIndex) => {
    if (!Array.isArray(section)) {
      issues.push({ code: 'INVALID_SECTION', sectionIndex, message: `第 ${sectionIndex + 1} 个 section 必须是数组` })
      return
    }
    const parsed = parsePersonaSectionName(section[0])
    if (parsed.scope === 'invalid') issues.push({ code: 'UNKNOWN_SCOPE', sectionIndex, message: `未知的 section selector [${parsed.selector}]` })
    if (!parsed.title.trim()) issues.push({ code: 'MISSING_SECTION_TITLE', sectionIndex, message: `第 ${sectionIndex + 1} 个 section 标题不能为空` })
    section.slice(1).forEach((item, itemIndex) => {
      if (typeof item !== 'string') issues.push({ code: 'INVALID_ITEM', sectionIndex, itemIndex, message: 'Section item 必须是字符串' })
      if (typeof item === 'string' && /\[(?:chat|talk(?::(?:private|public))?)\]/.test(item)) issues.push({ code: 'SELECTOR_IN_ITEM', sectionIndex, itemIndex, message: 'Section selector 只能位于 sectionName 开头，不能出现在内容 Item 中' })
      const referenceId = personaItemReference(item)
      if (typeof item === 'string' && item.startsWith('@') && !referenceId) issues.push({ code: 'INVALID_REFERENCE', sectionIndex, itemIndex, message: 'Text 引用必须使用 @[text-resource-id] 格式' })
      if (referenceId === '') issues.push({ code: 'EMPTY_REFERENCE', sectionIndex, itemIndex, message: 'Text 引用不能为空' })
      if (referenceId && (!/^[^\s@]+$/.test(referenceId))) issues.push({ code: 'INVALID_REFERENCE', sectionIndex, itemIndex, referenceId, message: `无效的 Text Resource 引用 @[${referenceId}]` })
      if (referenceId && textIds && !textIds.has(referenceId)) issues.push({ code: 'MISSING_REFERENCE', sectionIndex, itemIndex, referenceId, message: `找不到 Text Resource ${referenceId}` })
    })
  })
  if (!persona.orchestrator || typeof persona.orchestrator !== 'object') issues.push({ code: 'INVALID_ORCHESTRATOR', message: 'Persona orchestrator 必须是对象' })
  else if (!Array.isArray(persona.orchestrator.actions)) issues.push({ code: 'INVALID_ACTIONS', message: 'Persona orchestrator.actions 必须是数组' })
  else {
    const ids = new Set()
    persona.orchestrator.actions.forEach((action, actionIndex) => {
      if (!action?.id || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(action.id)) issues.push({ code: 'INVALID_ACTION_ID', actionIndex, message: `第 ${actionIndex + 1} 个 Action ID 无效` })
      else if (ids.has(action.id)) issues.push({ code: 'DUPLICATE_ACTION_ID', actionIndex, message: `Action ID ${action.id} 重复` })
      else ids.add(action.id)
      if (!String(action?.name || '').trim()) issues.push({ code: 'MISSING_ACTION_NAME', actionIndex, message: `第 ${actionIndex + 1} 个 Action 名称不能为空` })
      if (!action?.inputSchema || action.inputSchema.type !== 'object') issues.push({ code: 'INVALID_INPUT_SCHEMA', actionIndex, message: `Action ${action?.id || actionIndex + 1} inputSchema 必须是 object schema` })
      if (!action?.outputSchema || action.outputSchema.type !== 'object') issues.push({ code: 'INVALID_OUTPUT_SCHEMA', actionIndex, message: `Action ${action?.id || actionIndex + 1} outputSchema 必须是 object schema` })
      if (!Array.isArray(action?.tools)) issues.push({ code: 'INVALID_ACTION_TOOLS', actionIndex, message: `Action ${action?.id || actionIndex + 1} tools 必须是数组` })
      if (!['none', 'workspace'].includes(action?.sideEffects)) issues.push({ code: 'INVALID_SIDE_EFFECTS', actionIndex, message: `Action ${action?.id || actionIndex + 1} sideEffects 无效` })
    })
  }
  return issues
}

export function projectPersona(persona, target) {
  if (!['chat', 'talk', 'talk:public'].includes(target)) throw new TypeError(`不支持的 Persona 投影目标 ${target}`)
  const allowedScopes = target === 'chat'
    ? new Set(['all', 'chat'])
    : target === 'talk:public'
      ? new Set(['talk:public'])
      : new Set(['all', 'talk:private', 'talk:public'])
  return {
    id: persona.id,
    name: persona.name,
    sections: (persona.sections || []).flatMap(section => {
      if (!Array.isArray(section)) return []
      const { scope, title } = parsePersonaSectionName(section[0])
      return allowedScopes.has(scope) ? [[title, ...section.slice(1)]] : []
    }),
  }
}
