import { sessionNow } from './talk-clock.js'
import { createSession, createTalk, makeId, normalizeTalk } from './talk-model.js'
import { compileTalkPersona, compileWorldContext } from './talk-persona-prompt.js'
import { buildTalkContext } from './talk-prompt.js'
import { createTalkSessionContextJobRequest } from './talk-session-context-job-request.js'
import { createTalkStageJobRequest } from './talk-stage-job-request.js'
import { isRecord, matchTag } from '../../../../util/match.js'

const terminal = status => ['completed', 'failed', 'cancelled', 'interrupted'].includes(status)
const validDate = value => !Number.isNaN(Date.parse(value))

export class TalkApplication {
  static schema() {
    const variables = ['instruction', 'context', 'outputSchema']
    return {
      model: { type: 'text', label: '新 Talk 默认模型', default: 'deepseek-chat' },
      temperature: { type: 'number', label: '新 Talk 默认 Temperature', default: 0.7, min: 0, max: 2, step: 0.1 },
      maxTokens: { type: 'number', label: '新 Talk 默认 Max tokens', default: 2048, min: 1, step: 1 },
      thinking: { type: 'boolean', label: '新 Talk 默认启用思维过程', default: false },
      stream: { type: 'boolean', label: '新 Talk 默认流式输出', default: true },
      activityEnabled: { type: 'boolean', label: '新 Talk 默认启用主动行为', default: true },
      minReplyIntervalMinutes: { type: 'number', label: '默认最短主动联络间隔', default: 60, min: 0, step: 1 },
      maxProactivePerSession: { type: 'number', label: '默认每 Session 主动联络上限', default: 2, min: 0, step: 1 },
      stateTransitionPrompt: { type: 'textarea', label: 'State Transition Prompt', variables, default: '{{instruction}}\n\n运行上下文：{{context}}\n\n输出 Schema：{{outputSchema}}' },
      memoryReflectionPrompt: { type: 'textarea', label: 'Memory Reflection Prompt', variables, default: '{{instruction}}\n\n运行上下文：{{context}}\n\n输出 Schema：{{outputSchema}}' },
      planManagerPrompt: { type: 'textarea', label: 'Plan Manager Prompt', variables, default: '{{instruction}}\n\n运行上下文：{{context}}\n\n输出 Schema：{{outputSchema}}' },
      contactGatePrompt: { type: 'textarea', label: 'Contact Gate Prompt', variables, default: '{{instruction}}\n\n运行上下文：{{context}}\n\n输出 Schema：{{outputSchema}}' },
      conversationWriterPrompt: { type: 'textarea', label: 'Conversation Writer Prompt', variables, default: '{{instruction}}\n\n运行上下文：{{context}}\n\n输出 Schema：{{outputSchema}}' },
      sessionContextPrompt: { type: 'textarea', label: '频道背景生成 Prompt', variables: ['persona', 'worldContext', 'guidance'], default: '根据 Persona、世界背景和用户说明，生成本频道的用户身份、当前关系、情境与边界。' },
    }
  }

  constructor() {
    this.id = 'talk'; this.stateKey = 'talk'; this.workspace = null; this.talks = []
    this.ui = { activeTalkId: null, activeSessionId: null, panel: 'conversation' }
    this.running = new Map()
  }
  revive(workspace) {
    this.workspace = workspace
    const state = workspace.state.get(this.stateKey, {})
    this.talks = (state.talks || []).map(normalizeTalk)
    this.ui = { activeTalkId: null, activeSessionId: null, panel: 'conversation', ...state.ui }
    for (const talk of this.talks) for (const session of talk.sessions) for (const run of session.runs) if (!terminal(run.status)) run.status = 'interrupted'
  }
  init() { if (!this.activeTalk) this.ui.activeTalkId = this.talks[0]?.id || null; if (!this.activeSession) this.ui.activeSessionId = this.activeTalk?.sessions[0]?.id || null }
  get personas() { return this.workspace?.resources.list('persona') || [] }
  get texts() { return this.workspace?.resources.list('text') || [] }
  get activeTalk() { return this.talks.find(item => item.id === this.ui.activeTalkId) || null }
  get activeSession() { return this.activeTalk?.sessions.find(item => item.id === this.ui.activeSessionId) || null }
  sync() { this.workspace.state.set(this.stateKey, { talks: this.talks, ui: { ...this.ui } }) }
  save() { this.sync(); return this.workspace.saveState() }
  create(config) { if (!config.name?.trim()) throw new Error('请输入 Talk 名称'); if (!this.personas.some(item => item.id === config.personaId)) throw new Error('请选择 Persona Resource'); const talk = createTalk(config, this.workspace.getCustomSettings(this.id)); this.talks.push(talk); this.ui.activeTalkId = talk.id; this.ui.activeSessionId = talk.sessions[0].id; return talk }
  async select(talkId) { const talk = this.talks.find(item => item.id === talkId); if (!talk) return; this.ui.activeTalkId = talkId; this.ui.activeSessionId = talk.sessions.some(item => item.id === this.ui.activeSessionId) ? this.ui.activeSessionId : talk.sessions[0]?.id || null; return this.save() }
  async selectSession(sessionId) { if (!this.activeTalk?.sessions.some(item => item.id === sessionId)) return; this.ui.activeSessionId = sessionId; return this.save() }
  async remove(talkId) { const index = this.talks.findIndex(item => item.id === talkId); if (index < 0) return; for (const session of this.talks[index].sessions) this.stop(session.id); this.talks.splice(index, 1); if (this.ui.activeTalkId === talkId) { this.ui.activeTalkId = this.talks[index]?.id || this.talks[index - 1]?.id || null; this.ui.activeSessionId = this.activeTalk?.sessions[0]?.id || null } return this.save() }
  async addSession(name = '') { if (!this.activeTalk) return; const session = createSession(name.trim() || `频道 ${this.activeTalk.sessions.length + 1}`); this.activeTalk.sessions.push(session); this.ui.activeSessionId = session.id; await this.save(); return session }
  async removeSession(sessionId) { const talk = this.activeTalk; if (!talk) return; this.stop(sessionId); const index = talk.sessions.findIndex(item => item.id === sessionId); if (index < 0) return; talk.sessions.splice(index, 1); if (this.ui.activeSessionId === sessionId) this.ui.activeSessionId = talk.sessions[index]?.id || talk.sessions[index - 1]?.id || null; return this.save() }
  async updateTalk(patch) { if (!this.activeTalk) return; Object.assign(this.activeTalk, patch, { id: this.activeTalk.id }); return this.save() }

  async sendMessage(content) {
    const text = String(content || '').trim(); if (!text) return
    const session = this.activeSession; if (!session) throw new Error('请先创建 Session')
    const at = sessionNow(session.clock)
    session.conversation.push({ id: makeId('message'), role: 'user', content: text, createdAt: at, contactKind: 'user' })
    session.events.push({ id: makeId('event'), type: 'user_message', occurredAt: at, payload: { content: text } })
    await this.save()
    return this.runPipeline({ userInitiated: true })
  }

  advanceSession(session) {
    const at = sessionNow(session.clock)
    for (const plan of session.plans.filter(item => item.status === 'pending')) {
      if (plan.expiresAt && Date.parse(plan.expiresAt) <= Date.parse(at)) { plan.status = 'expired'; plan.processedAt = at; continue }
      if (Date.parse(plan.scheduledAt) > Date.parse(at)) continue
      plan.status = 'completed'; plan.processedAt = at
      if (plan.stateEffect?.trim()) session.state = [session.state, plan.stateEffect.trim()].filter(Boolean).join('\n')
      session.events.push({ id: makeId('event'), type: 'plan_completed', occurredAt: at, payload: { planId: plan.id } })
    }
    session.lastProcessedAt = at
    return at
  }

  async enterActiveSession() {
    const session = this.activeSession
    if (!session || this.running.has(session.id)) return null
    const at = sessionNow(session.clock)
    session.events.push({ id: makeId('event'), type: 'session_opened', occurredAt: at, payload: {} })
    await this.save()
    return this.runPipeline({ trigger: 'entry' })
  }

  async runPipeline({ userInitiated = false, trigger = userInitiated ? 'user' : 'maintenance' } = {}) {
    const talk = this.activeTalk, session = this.activeSession
    if (!talk || !session) throw new Error('请先选择 Talk 和 Session')
    if (this.running.has(session.id)) throw new Error('当前 Session 已在运行')
    const persona = this.personas.find(item => item.id === talk.personaId); if (!persona) throw new Error('Talk 引用的 Persona Resource 不存在')
    const keyRef = this.workspace.keyRefFor(talk.api?.keyRefId); if (!keyRef) throw new Error('Talk 没有可用 API Key')
    const controller = new AbortController(); this.running.set(session.id, controller)
    const run = { id: makeId('talk-run'), status: 'running', trigger, currentStage: null, stages: [], startedAt: new Date().toISOString(), completedAt: null, error: null }
    session.runs.push(run); if (session.runs.length > 30) session.runs.shift()
    try {
      const at = this.advanceSession(session)
      const personaPrompt = await compileTalkPersona(persona, this.workspace)
      const worldContext = await compileWorldContext(talk.worldContext, this.workspace)
      const eventIds = new Set(session.events.filter(item => !item.handledAt).map(item => item.id))
      await this.save()
      const stage = stageId => this.executeStage({ talk, session, run, stageId, at, personaPrompt, worldContext, keyRef, signal: controller.signal })
      let gate
      if (userInitiated) gate = await stage('contact-gate')
      else { this.applyState(session, await stage('state-transition')); this.applyMemory(session, await stage('memory-reflection')); this.applyPlans(session, await stage('plan-manager')); gate = await stage('contact-gate') }
      const required = session.plans.some(item => item.status === 'completed' && item.contactIntent === 'send' && !item.contactSentAt)
      const canProactivelySend = userInitiated || this.proactiveAllowed(talk, session, at)
      if ((gate.decision === 'send' || required) && canProactivelySend) {
        const written = await stage('conversation-writer')
        const message = { id: makeId('message'), role: 'assistant', speakerId: talk.personaId, content: written.content.trim(), createdAt: at, sourceRunId: run.id, contactKind: userInitiated ? 'user-reply' : required ? 'required-contact' : 'proactive' }
        session.conversation.push(message); session.lastContactAt = at
        for (const plan of session.plans) if (plan.status === 'completed' && plan.contactIntent === 'send' && !plan.contactSentAt) plan.contactSentAt = at
      }
      if (userInitiated && gate.maintenance === 'immediate') { this.applyState(session, await stage('state-transition')); this.applyMemory(session, await stage('memory-reflection')); this.applyPlans(session, await stage('plan-manager')) }
      session.nextCheckAt = validDate(gate.nextCheckAt) ? new Date(gate.nextCheckAt).toISOString() : null
      for (const event of session.events) if (eventIds.has(event.id) && !event.handledAt) event.handledAt = at
      run.status = 'completed'
      return run
    } catch (error) { run.status = error.name === 'AbortError' ? 'cancelled' : 'failed'; run.error = error.message; throw error }
    finally { run.completedAt = new Date().toISOString(); this.running.delete(session.id); await this.save() }
  }

  proactiveAllowed(talk, session, at) { if (!talk.activity.enabled) return false; const count = session.conversation.filter(item => item.contactKind === 'proactive').length; if (count >= Number(talk.activity.maxProactivePerSession || 0)) return false; const gap = Number(talk.activity.minReplyIntervalMinutes || 0) * 60000; return !session.lastContactAt || Date.parse(at) - Date.parse(session.lastContactAt) >= gap }
  applyState(session, result) { if (result.state?.trim()) session.state = result.state.trim() }
  applyMemory(session, result) { for (const item of result.add || []) session.memory.push({ id: makeId('memory'), content: item.content.trim() }); for (const item of result.revise || []) { const memory = session.memory.find(current => current.id === item.id); if (memory) memory.content = item.content.trim() } const removed = new Set(result.forget || []); session.memory = session.memory.filter(item => !removed.has(item.id)) }
  applyPlans(session, result) { for (const item of result.create || []) { if (!validDate(item.scheduledAt)) continue; session.plans.push({ id: makeId('plan'), action: item.action.trim(), scheduledAt: new Date(item.scheduledAt).toISOString(), expiresAt: validDate(item.expiresAt) ? new Date(item.expiresAt).toISOString() : null, stateEffect: item.stateEffect.trim(), contactIntent: item.contactIntent, status: 'pending', processedAt: null }) } const cancelled = new Set(result.cancel || []); for (const plan of session.plans) if (plan.status === 'pending' && cancelled.has(plan.id)) plan.status = 'cancelled' }

  async executeStage({ talk, session, run, stageId, at, personaPrompt, worldContext, keyRef, signal }) {
    if (signal.aborted) throw new DOMException('Talk Runtime 已停止', 'AbortError')
    run.currentStage = stageId
    const proactiveSent = session.conversation.filter(item => item.contactKind === 'proactive').length
    const context = buildTalkContext(session, personaPrompt, worldContext, at, { enabled: talk.activity.enabled, minReplyIntervalMinutes: talk.activity.minReplyIntervalMinutes, proactiveSent, maxProactivePerSession: talk.activity.maxProactivePerSession }, { trigger: run.trigger, userInitiated: run.trigger === 'user', stageIsFirstLLMStage: run.stages.length === 0 })
    const request = createTalkStageJobRequest({ stageId, context, requestOptions: talk.requestOptions }, this.workspace.getCustomSettings(this.id))
    const entry = { stageId, jobId: null, status: 'creating', applied: false, startedAt: new Date().toISOString() }; run.stages.push(entry); await this.save()
    const result = await this.executeStructuredJob(request, keyRef, { source: `talk:${talk.name}`, talkId: talk.id, sessionId: session.id, runId: run.id, stageId }, job => { entry.jobId = job.id; entry.status = 'running'; void this.save() })
    if (signal.aborted) throw new DOMException('Talk Runtime 已停止', 'AbortError')
    entry.status = 'completed'; entry.applied = true; entry.completedAt = new Date().toISOString(); await this.save(); return result
  }

  executeStructuredJob(request, keyRef, metadata, onCreated) {
    return new Promise((resolve, reject) => {
      let job = null, settled = false
      const finish = (callback, value) => { if (settled) return; settled = true; callback(value) }
      const validate = (value, rawText) => { const validation = isRecord(value) ? { ok: true, value } : request.validate(rawText || job?.responseText || ''); if (!validation.ok) return finish(reject, new Error(validation.errors.join('；'))); finish(resolve, validation.value) }
      const stateCases = {
        completed: () => { if (job?.responseText) validate(job.value, job.responseText) },
        failed: state => finish(reject, new Error(`Talk Job ${state}`)),
        cancelled: state => finish(reject, new Error(`Talk Job ${state}`)),
      }
      const eventCases = {
        result: event => validate(event.value, event.rawText),
        state: event => matchTag(event.state, stateCases, () => {})(event.state),
      }
      const onEvent = event => matchTag(event.type, eventCases, () => {})(event)
      this.workspace.createJob({ request, keyRef, metadata, onEvent }).then(created => { job = created; onCreated?.(created); if (job.status === 'completed') validate(job.value, job.responseText) }).catch(error => finish(reject, error))
    })
  }

  async generateSessionContext(guidance = '') { const talk = this.activeTalk, session = this.activeSession; if (!talk || !session) return; const persona = this.personas.find(item => item.id === talk.personaId); if (!persona) throw new Error('Persona 不存在'); const keyRef = this.workspace.keyRefFor(talk.api.keyRefId); if (!keyRef) throw new Error('Talk 没有可用 API Key'); const personaPrompt = await compileTalkPersona(persona, this.workspace); const worldContext = await compileWorldContext(talk.worldContext, this.workspace); const request = createTalkSessionContextJobRequest({ persona: personaPrompt, worldContext, guidance, requestOptions: talk.requestOptions }, this.workspace.getCustomSettings(this.id)); const value = await this.executeStructuredJob(request, keyRef, { source: `talk-context:${talk.name}`, talkId: talk.id, sessionId: session.id }); session.sessionContext = value.sessionContext; await this.save(); return value }
  async stop(sessionId = this.ui.activeSessionId) { this.running.get(sessionId)?.abort(); const session = this.activeTalk?.sessions.find(item => item.id === sessionId); const run = [...(session?.runs || [])].reverse().find(item => item.status === 'running'); if (run) { const jobIds = run.stages.map(item => item.jobId).filter(Boolean); await Promise.allSettled(jobIds.map(jobId => this.workspace.abortJob(jobId))); run.status = 'cancelled'; await this.save() } }
  close() { for (const controller of this.running.values()) controller.abort(); this.running.clear() }
}
