import { sessionNow } from './clock.js'
import { createConversationMessage, createPlan } from './model.js'
import { PROMPT_STAGES, buildPromptContext } from '../../../../llm/index.js'

export function advanceSession(session, realNow = new Date()) {
  const currentTime = sessionNow(session.clock, realNow)
  const duePlans = session.plans.filter(plan => plan.status === 'pending' && plan.scheduledAt <= currentTime)

  for (const plan of duePlans) {
    appendState(session, plan.stateEffect)
    plan.status = 'completed'
    plan.processedAt = currentTime
    session.events.push({
      id: `event-${plan.id}`,
      type: 'plan_completed',
      occurredAt: plan.scheduledAt,
      processedAt: currentTime,
      payload: { planId: plan.id, action: plan.action },
    })
  }

  session.lastProcessedAt = currentTime
  return { currentTime, duePlans }
}

function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function asArray(value) { return Array.isArray(value) ? value : [] }
function appendState(session, effect) {
  const text = String(effect || '').trim()
  if (text) session.state = [session.state, text].filter(Boolean).join('\n')
}
function parseResult(value) {
  if (value && typeof value === 'object') return value
  throw new Error('Talk Prompt 未返回有效 JSON')
}
function stage(id) { return PROMPT_STAGES.find(item => item.id === id) }
function validTime(value) { return value && !Number.isNaN(new Date(value).getTime()) }
function snapshot(value) { return JSON.parse(JSON.stringify(value)) }

function addRuntimeLog(session, entry) {
  session.runtimeLog ||= []
  session.runtimeLog.push(entry)
  if (session.runtimeLog.length > 80) session.runtimeLog.splice(0, session.runtimeLog.length - 80)
}

function applyState(session, result) {
  if (typeof result.state === 'string') session.state = result.state.trim()
  for (const id of asArray(result.completedPlanIds)) {
    const plan = session.plans.find(item => item.id === id && item.status === 'pending')
    if (plan) { appendState(session, plan.stateEffect); plan.status = 'completed'; plan.processedAt = session.lastProcessedAt }
  }
}

function applyMemory(session, result, genId, at) {
  for (const item of asArray(result.add).slice(0, 6)) {
    const memory = asObject(item)
    const belief = String(memory.belief || memory.content || '').trim()
    if (!belief) continue
    session.memory.push({ id: genId(), belief, feeling: String(memory.feeling || ''), basis: asArray(memory.basis).slice(0, 4), confidence: Math.max(0, Math.min(1, Number(memory.confidence) || 0.5)), importance: Math.max(0, Math.min(1, Number(memory.importance) || 0.5)), formedAt: at })
  }
  for (const item of asArray(result.revise).slice(0, 6)) {
    const revision = asObject(item)
    const memory = session.memory.find(candidate => candidate.id === revision.id)
    if (!memory) continue
    if (String(revision.belief || '').trim()) memory.belief = String(revision.belief).trim()
    if (revision.feeling !== undefined) memory.feeling = String(revision.feeling)
    memory.revisedAt = at
  }
  const remove = new Set(asArray(result.forget))
  if (remove.size) session.memory = session.memory.filter(item => !remove.has(item.id))
}

function applyPlans(session, result, genId) {
  for (const item of asArray(result.create).slice(0, 4)) {
    const plan = asObject(item)
    if (!String(plan.action || '').trim() || !validTime(plan.scheduledAt)) continue
    const created = createPlan({ id: genId(), action: plan.action, scheduledAt: new Date(plan.scheduledAt).toISOString() })
    created.expiresAt = validTime(plan.expiresAt) ? new Date(plan.expiresAt).toISOString() : null
    created.stateEffect = String(plan.stateEffect || '').trim()
    created.contactIntent = ['none', 'consider', 'send'].includes(plan.contactIntent) ? plan.contactIntent : 'consider'
    session.plans.push(created)
  }
  for (const id of asArray(result.cancel)) {
    const plan = session.plans.find(item => item.id === id && item.status === 'pending')
    if (plan) plan.status = 'cancelled'
  }
}

function contactAllowed(talk, session, at) {
  const activity = talk.activity || {}
  if (!activity.enabled) return false
  const minGap = Math.max(0, Number(activity.minReplyIntervalMinutes) || 0) * 60000
  if (session.lastContactAt && new Date(at).getTime() - new Date(session.lastContactAt).getTime() < minGap) return false
  const sent = session.conversation.filter(message => message.role === 'talk').length
  return sent < Math.max(1, Number(activity.maxProactivePerSession) || 1)
}

function planRequiresContact(plan) {
  return plan.contactIntent === 'send' || /^(?:给用户)?发消息|^发一段/.test(plan.action || '')
}

function pendingContacts(session) {
  return session.plans.filter(plan => plan.status === 'completed' && planRequiresContact(plan) && !plan.contactSentAt)
}

export async function runTalkPipeline({ talk, session, requestStage, genId, visible = true }) {
  if (!visible) return { skipped: 'hidden' }
  const advanced = advanceSession(session)
  const at = advanced.currentTime
  const run = async (id, parse = parseResult) => {
    const input = buildPromptContext(talk, session, at)
    const log = { id: genId(), stage: id, requestedAt: new Date().toISOString(), input: snapshot(input), status: 'running' }
    addRuntimeLog(session, log)
    try {
      const raw = await requestStage(stage(id), input)
      log.response = typeof raw === 'string' ? raw : JSON.stringify(raw)
      const result = parse(raw)
      log.status = 'ok'
      return result
    } catch (error) {
      log.status = 'error'
      log.error = error.message
      throw error
    }
  }

  applyState(session, await run('state-transition'))
  applyMemory(session, await run('memory-reflection'), genId, at)
  applyPlans(session, await run('plan-manager'), genId)
  const decision = await run('contact-gate')
  const requiredContacts = pendingContacts(session)
  let message = null
  const shouldSend = decision.decision === 'send' || requiredContacts.length > 0
  if (shouldSend && contactAllowed(talk, session, at)) {
    const written = await run('conversation-writer')
    const content = String(written.content || written.message || written.text || '').trim()
    if (content) {
      message = createConversationMessage({ id: genId(), role: 'talk', content })
      session.conversation.push(message)
      session.lastContactAt = at
      for (const plan of requiredContacts) plan.contactSentAt = at
      session.events.push({ id: genId(), type: 'contact_delivered', occurredAt: at, handledAt: at, payload: { messageId: message.id, planIds: requiredContacts.map(plan => plan.id) } })
    }
  }
  const remainingContacts = pendingContacts(session)
  const retryAt = remainingContacts.length
    ? new Date(Math.max(new Date(at).getTime() + 60000, new Date(session.lastContactAt || at).getTime() + Math.max(0, Number(talk.activity?.minReplyIntervalMinutes) || 0) * 60000)).toISOString()
    : null
  session.nextCheckAt = retryAt || (validTime(decision.nextCheckAt) ? new Date(decision.nextCheckAt).toISOString() : null)
  for (const event of session.events) if (!event.handledAt) event.handledAt = at
  return { at, message, decision: shouldSend ? 'send' : 'wait', duePlans: advanced.duePlans.length }
}
