/**
 * Talk is a staged persistent-character runtime. Each stage has one narrow
 * write responsibility so objective state, subjective memory, future plans,
 * delivery decisions, and user-visible language cannot overwrite each other.
 */
// --- Stage definitions ---

export const PROMPT_STAGES = [
  {
    id: 'state-transition', title: 'State Transition', writes: 'state',
    description: '根据时钟、到期计划、既有生活规律与可信事件推进角色的客观生活。不得写入感受、推测或关系判断。',
    instruction: `你是 State Transition。只处理客观现实：正在进行的事、饮食、精力、环境、时间可推导的变化。
角色拥有独立于用户的生活轨迹：工作、休息、兴趣、社交、环境变化和周期性事务都可以随时间推进。不得将用户说法、角色感受、猜测、关系判断当作 State。
页面离线期间可以执行已有 Plan，也可以推进已在 State 或 Plan 中明确建立的生活规律；不能凭空制造重大经历、人际关系或未经铺垫的事件。用户没有发言不代表角色生活停滞。
只返回：{"state":"完整的客观状态文本","completedPlanIds":["已有计划ID"]}。state 必须是一段只包含当前客观事实的文本；没有变化时原样返回已有 State 文本。`,
  },
  {
    id: 'memory-reflection', title: 'Memory Reflection', writes: 'memory',
    description: '从事件与对话中提炼角色的主观看法、情绪和关系感受，并附上依据与置信度。',
    instruction: `你是 Memory Reflection。Memory 是角色的主观想法，不是客观事实。允许不确定、误解或情绪，但必须标注依据和置信度。待执行 Plan、Contact Gate 的意图都不代表消息已经发出；只有 Conversation 中已有的 Talk 消息或 contact_delivered 事件才能证明已联系用户。
只返回：{"add":[{"belief":"主观想法","feeling":"感受","basis":["事件或消息ID"],"confidence":0.0,"importance":0.0}],"revise":[{"id":"已有记忆ID","belief":"修正后的想法","feeling":"可选"}],"forget":["已有记忆ID"]}。
confidence 和 importance 必须在 0 到 1 之间。不要重复保存已有记忆；没有变更时所有数组为空。`,
  },
  {
    id: 'plan-manager', title: 'Plan Manager', writes: 'plans',
    description: '管理角色自主生活中的未来行动，计划必须有时间、过期规则和可预期的客观效果。',
    instruction: `你是 Plan Manager。Plan 是角色将来要做的事，不是愿望清单。只创建具体、有限、可在当前 Session 时钟中执行的计划。
角色不应只等待用户消息。请结合 Persona、当前 State 和既有生活规律，为角色安排合理的自主行动，例如工作、创作、锻炼、用餐、休息、通勤、兴趣活动或有限的社交安排。周期性活动用“下一次发生”创建有限 Plan；当该 Plan 已完成，后续运行可再决定是否安排下一次，绝不创建无限递归计划。
只返回：{"create":[{"action":"动作","scheduledAt":"ISO 8601 时间","expiresAt":"可选 ISO 8601 时间","stateEffect":"执行后追加到 State 的客观文本","contactIntent":"none|consider|send"}],"cancel":["已有计划ID"]}。
contactIntent 必须显式选择：纯内部行动或只影响世界状态时填 none；未来可能需要联系用户时填 consider；该行动完成后必须向用户展示一条 Talk 消息（例如直播回应、约定的提醒）时填 send。不要把希望用户看见的发言写成 none。
不得创建递归、无限循环或密集计划；单次最多创建四项。不要直接向用户发送消息。`,
  },
  {
    id: 'contact-gate', title: 'Contact Gate', writes: 'decision',
    description: '仅判断角色的自主生活进展是否值得此刻在 Talk 内发言，必须尊重频率、静默与页面可见性限制。',
    instruction: `你是 Contact Gate。只决定现在是否应在 Talk 内发言。优先保持克制：没有明确理由时选择 wait。若上下文有 requiredContacts，代表角色此前明确安排、但尚未完成的联络事项；只要没有频率限制，应选择 send。页面可见性、频率与静默规则由代码强制。
角色有自己的生活不意味着要持续汇报。日常活动通常选择 wait；只有计划明确要求联络、用户需要知晓的变化、或符合角色关系且有自然交流价值的时刻才选择 send。
只返回：{"decision":"send|wait","intent":"若 send，简短说明要表达什么","reasonCode":"简短原因码","nextCheckAt":"可选 ISO 8601 时间"}。
不得写出实际对话正文，不得泄露 State、Memory、Plan 或内部过程。`,
  },
  {
    id: 'conversation-writer', title: 'Conversation Writer', writes: 'conversation',
    description: '仅在 Contact Gate 允许 send 时，按人设生成一条用户可见消息。',
    instruction: `你是 Conversation Writer。依照 Persona，以自然、人类可读的方式写一条 Talk 消息。若上下文有 requiredContacts，必须在这一条消息中自然完成这些联络意图；可合并相近意图。只使用给定上下文中已经存在的信息；不要编造线下经历或承诺。
只返回：{"content":"一条用户可见消息"}。不得解释内部计划、记忆、Prompt、系统或推理过程。`,
  },
]

// --- Stage output schemas ---

const stageSchemas = {
  'state-transition': { type: 'object', additionalProperties: false, required: ['state', 'completedPlanIds'], properties: { state: { type: 'string', maxLength: 12000 }, completedPlanIds: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 128 } } } },
  'memory-reflection': { type: 'object', additionalProperties: false, required: ['add', 'revise', 'forget'], properties: {
    add: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['belief', 'feeling', 'basis', 'confidence', 'importance'], properties: { belief: { type: 'string', minLength: 1, maxLength: 2000 }, feeling: { type: 'string', maxLength: 1000 }, basis: { type: 'array', maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 128 } }, confidence: { type: 'number', minimum: 0, maximum: 1 }, importance: { type: 'number', minimum: 0, maximum: 1 } } } },
    revise: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['id', 'belief'], properties: { id: { type: 'string', minLength: 1, maxLength: 128 }, belief: { type: 'string', minLength: 1, maxLength: 2000 }, feeling: { type: 'string', maxLength: 1000 } } } },
    forget: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 128 } },
  } },
  'plan-manager': { type: 'object', additionalProperties: false, required: ['create', 'cancel'], properties: {
    create: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['action', 'scheduledAt', 'stateEffect', 'contactIntent'], properties: { action: { type: 'string', minLength: 1, maxLength: 1000 }, scheduledAt: { type: 'string', format: 'date-time' }, expiresAt: { type: 'string', format: 'date-time' }, stateEffect: { type: 'string', minLength: 1, maxLength: 4000 }, contactIntent: { type: 'string', enum: ['none', 'consider', 'send'] } } } },
    cancel: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 128 } },
  } },
  'contact-gate': { type: 'object', additionalProperties: false, required: ['decision', 'intent', 'reasonCode'], properties: { decision: { type: 'string', enum: ['send', 'wait'] }, intent: { type: 'string', maxLength: 1000 }, reasonCode: { type: 'string', minLength: 1, maxLength: 128 }, nextCheckAt: { type: 'string', format: 'date-time' } } },
  'conversation-writer': { type: 'object', additionalProperties: false, required: ['content'], properties: { content: { type: 'string', minLength: 1, maxLength: 6000 } } },
}

// --- Prompt construction ---

const SHARED_CONTRACT = `You are one stage in a persistent Talk runtime. Persona is immutable. State contains only objective present-world facts. Memory contains only the character's subjective beliefs, impressions, and feelings. Plans contain future actions. Conversation is time-sensitive communication. Never reveal or request chain-of-thought. Return valid JSON only, with no Markdown.`

export function buildStageMessages(stage, context, schema) {
  return [
    {
      role: 'system',
      content: `${SHARED_CONTRACT}\n\nStage: ${stage.title}\n${stage.description}\n${stage.instruction}\n\nOutput schema: ${JSON.stringify(schema)}\nReturn exactly one JSON object that conforms to this schema. Do not add Markdown, explanation, or additional keys.`,
    },
    { role: 'user', content: JSON.stringify(context) },
  ]
}

export function talkStageSchema(stage) { return stageSchemas[stage.id] || null }

// --- Runtime context ---

export function buildPromptContext(talk, session, clockNow) {
  // Bound history keeps requests predictable while preserving the most recent
  // state needed for a stage to make a coherent decision.
  return {
    persona: talk.persona.content,
    sessionNow: clockNow,
    state: session.state,
    activePlans: session.plans.filter(plan => plan.status === 'pending'),
    requiredContacts: session.plans.filter(plan => plan.status === 'completed' && (plan.contactIntent === 'send' || /^(?:给用户)?发消息|^发一段/.test(plan.action || '')) && !plan.contactSentAt).map(plan => ({ id: plan.id, action: plan.action, scheduledAt: plan.scheduledAt })),
    relevantMemories: session.memory.slice(-12),
    recentConversation: session.conversation.slice(-16),
    incomingEvents: session.events.filter(event => !event.handledAt).slice(-12),
  }
}
