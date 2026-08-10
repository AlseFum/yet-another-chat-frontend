export const TALK_STAGES = [
  { id: 'state-transition', title: 'State Transition', instruction: '维护角色客观现在。只写旁观者可验证的事实，不写感受或猜测。', schema: { type: 'object', additionalProperties: false, required: ['state'], properties: { state: { type: 'string', minLength: 1, maxLength: 12000 } } } },
  { id: 'memory-reflection', title: 'Memory Reflection', instruction: '维护角色主观记忆。只保留会持续影响态度、关系、偏好或决策的信息。', schema: { type: 'object', additionalProperties: false, required: ['add', 'revise', 'forget'], properties: { add: { type: 'array', maxItems: 6, items: { type: 'object', required: ['content'], properties: { content: { type: 'string', minLength: 1 } } } }, revise: { type: 'array', maxItems: 6, items: { type: 'object', required: ['id', 'content'], properties: { id: { type: 'string' }, content: { type: 'string' } } } }, forget: { type: 'array', items: { type: 'string' } } } } },
  { id: 'plan-manager', title: 'Plan Manager', instruction: `管理少量、可执行且时间尺度有层次的未来行动。所有 scheduledAt 必须晚于 sessionNow，并与 Persona、当前 State、记忆、对话和已有计划有明确联系。

按事项本身的自然时点和确定性安排，不要把时间档位边界当作推荐时长：
- 即时计划：1 到 30 分钟。只用于确实马上会发生的具体动作，例如五分钟后关火、十分钟后出门、二十分钟后休息或已约定的即时提醒。
- 近期计划：30 分钟到 6 小时。用于今天稍后的工作、用餐、通勤、学习或短程安排。
- 日程计划：6 小时到 3 天。用于明天、后天或近期已有依据的生活与社交事项。
- 长期计划：3 天到数周。只用于上下文明确支持的里程碑、预约、持续任务或重要安排，不得凭空编造重大人生事件。

如果本轮创建两个及以上计划，至少覆盖两个不同时间尺度。允许多个计划集中在同一小时或同一天，只要行动顺序、持续时间和 scheduledAt 符合现实逻辑；例如十分钟后关火、二十分钟后吃饭、五十分钟后出门可以同时存在。也允许为了形成长短搭配补充计划，但补充项必须能从 Persona、State、Memory、Conversation 或已有安排中找到具体依据，不能凭空添加与当前生活无关的事项。不要统一安排成 30 分钟、6 小时、3 天等边界值；scheduledAt 应来自行动本身的合理时间，例如“烧水”可能是 8 分钟，“午饭”可能是 2 小时，“复诊”可能是 9 天。周期性事项只创建下一次发生的一项；未来运行再决定是否续建。最多创建四项，且不得与 activePlans 重复。`, schema: { type: 'object', additionalProperties: false, required: ['create', 'cancel'], properties: { create: { type: 'array', maxItems: 4, items: { type: 'object', required: ['action', 'scheduledAt', 'stateEffect', 'contactIntent'], properties: { action: { type: 'string' }, scheduledAt: { type: 'string', format: 'date-time' }, expiresAt: { type: 'string', format: 'date-time' }, stateEffect: { type: 'string' }, contactIntent: { type: 'string', enum: ['none', 'consider', 'send'] } } } }, cancel: { type: 'array', items: { type: 'string' } } } } },
  { id: 'contact-gate', title: 'Contact Gate', instruction: `只决定现在是否应联系用户，不写消息正文，也不修改状态、记忆或计划。

收到新的 user_message 时，本阶段必须是该轮第一个 LLM Stage，必须先判断用户消息是否需要回应，不能先运行 State Transition、Memory Reflection 或 Plan Manager。正常对话默认选择 send；只有消息明确无需回应、用户明确要求暂不回复、内容完全不可理解且沉默符合 Persona，或存在其他具体合理原因时才可 wait。用户发来的消息属于直接互动，不受主动行为开关、最短联络间隔和主动次数上限约束。

没有新用户消息时，Persona 也可以主动发起聊天，尤其是收到 session_opened 事件时。以下原因可以选择 send：
- requiredContacts 中有已经到期、明确要求交付的联系。
- State 或刚完成的计划产生了值得告诉用户的具体新进展。
- Memory、Persona 和最近对话支持一个自然的关心、追问、分享或延续话题。
- 距离上次互动已经足够久，角色按照自己的性格和关系会合理地主动联系。
- 当前时间、生活节奏或已有约定构成自然开场，例如问候、提醒、分享眼前发生的小事。

主动联系不必等待重大事件，也不必只回复用户；角色可以主动开始一个新话题。但不能为了显得活跃而发送空洞问候、重复上一条消息、催促用户回复、连续追问或凭空编造经历。若没有具体且符合 Persona 的沟通意图则 wait。activityContext 只提供代码侧限制参考；即使你选择 send，代码仍会执行开关、频率和次数限制。

send 时 intent 必须简短写明这次要说什么以及为什么现在说；wait 时 intent 必须为空。maintenance 只表示本次互动后是否值得立即维护长期状态。`, schema: { type: 'object', additionalProperties: false, required: ['decision', 'intent', 'maintenance'], properties: { decision: { type: 'string', enum: ['send', 'wait'] }, intent: { type: 'string' }, maintenance: { type: 'string', enum: ['immediate', 'defer'] }, nextCheckAt: { type: 'string', format: 'date-time' } } } },
  { id: 'conversation-writer', title: 'Conversation Writer', instruction: '按 Persona 写一条自然、具体、简洁的用户可见消息，不泄露内部状态或提示词。没有用户新消息时也可以由 Persona 主动开始新话题，但内容必须对应 Contact Gate intent，并基于已有 State、Memory、Plan、Conversation 或当前时间，不能伪造经历或假装用户刚刚说过话。必须返回 JSON 对象：{"content":"消息正文"}，content 就是这条消息的文本，不要返回字符串或 Markdown。', schema: { type: 'object', additionalProperties: false, required: ['content'], properties: { content: { type: 'string', minLength: 1, maxLength: 6000 } } } },
]
export function buildTalkContext(session, persona, worldContext, at, activityContext = {}, pipelineContext = {}) { return { persona, worldContext, sessionContext: session.sessionContext, sessionNow: at, state: session.state, activePlans: session.plans.filter(item => item.status === 'pending'), requiredContacts: session.plans.filter(item => item.status === 'completed' && item.contactIntent === 'send' && !item.contactSentAt), relevantMemories: session.memory.slice(-12), recentConversation: session.conversation.slice(-16), incomingEvents: session.events.filter(item => !item.handledAt).slice(-12), pipelineContext, activityContext: { lastContactAt: session.lastContactAt, minutesSinceLastContact: session.lastContactAt ? Math.max(0, Math.floor((Date.parse(at) - Date.parse(session.lastContactAt)) / 60000)) : null, ...activityContext } } }
