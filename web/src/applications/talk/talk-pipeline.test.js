import assert from 'node:assert/strict'
import { TalkApplication } from './talk-application.js'
import { createSession, createTalk } from './talk-model.js'

// ===========================================================================
// Mock LLM / Workspace(不调真实 LLM,模拟 Job 生命周期 + retry)
// ===========================================================================

class MockLLM {
  constructor() { this.queue = []; this.calls = 0 }
  enqueue(resp) { this.queue.push(resp); return this }
  next() {
    this.calls++
    if (!this.queue.length) throw new Error('mock LLM 队列耗尽')
    return this.queue.shift()
  }
}

class MockWorkspace {
  constructor(llm, { personas = [], strict = false } = {}) {
    this.llm = llm; this.saves = 0; this._personas = personas; this.strict = strict
    this.state = { get: () => ({}), set: () => {} }
  }
  getCustomSettings() { return {} }
  keyRefFor() { return { type: 'server', keyId: 'mock-key' } }
  get resources() { return { list: (type) => (type === 'persona' ? this._personas : []) } }
  async createJob({ request, onEvent }) {
    if (this.strict) {
      // strict:模拟后端 validator 保留(修复后)——校验失败走 retry
      let attempt = 0
      while (attempt < 5) {
        const resp = this.llm.next()
        const value = resp.value !== undefined ? resp.value : resp.content
        const rawText = typeof value === 'string' ? value : JSON.stringify(value)
        const validation = request.validate(rawText || '')
        if (validation.ok) {
          onEvent({ type: 'result', value: validation.value, rawText })
          onEvent({ type: 'state', state: 'completed' })
          return { id: `mock-${Date.now()}`, status: 'completed', value: validation.value, responseText: rawText }
        }
        const retried = request.retry({
          messages: request.messages, output: rawText, errors: validation.errors, attempt: attempt + 1,
        })
        if (!retried) break
        attempt++
      }
      onEvent({ type: 'state', state: 'failed' })
      return { id: `mock-${Date.now()}`, status: 'failed', error: 'mock 全部尝试失败' }
    }
    // 宽松:模拟真实后端(validator 跨进程丢失,默认 validator ok:true)→ 直接 completed,value=原文
    // 前端 executeStructuredJob 的 validate 再做解析/兜底/失败判定
    const resp = this.llm.next()
    const value = resp.value !== undefined ? resp.value : resp.content
    const rawText = typeof value === 'string' ? value : JSON.stringify(value)
    onEvent({ type: 'result', value, rawText })
    onEvent({ type: 'state', state: 'completed' })
    return { id: `mock-${Date.now()}`, status: 'completed', value, responseText: rawText }
  }
  async saveState() { this.saves++ }
}

// ===========================================================================
// 测试基建
// ===========================================================================

const DEFAULT_OPTS = { model: 'mock-model', temperature: 0.7, maxTokens: 2048, thinking: false, stream: true }

function makeApp(llm, { state = '庄园主厅', plans = [], strict = false } = {}) {
  const app = new TalkApplication()
  const persona = { id: 'persona-1', name: '留琴', sections: [['身份', '女仆']], orchestrator: { summary: '', actions: [] } }
  const talk = createTalk(
    { name: '测试Talk', personaId: 'persona-1', api: { keyRefId: 'mock-key' }, worldContext: { content: '白蔷薇庄园' } },
    DEFAULT_OPTS,
  )
  const session = createSession('测试频道')
  session.state = state
  session.plans = plans
  talk.sessions = [session]
  app.workspace = new MockWorkspace(llm, { personas: [persona], strict })
  app.talks = [talk]
  app.ui = { activeTalkId: talk.id, activeSessionId: session.id }
  return { app, talk, session, persona }
}

function runStage(app, { talk, session }, stageId, run) {
  const r = run || { id: 'run-x', status: 'running', stages: [], currentStage: null }
  return app.executeStage({
    talk, session, run: r, stageId,
    at: session.clock ? new Date().toISOString() : undefined,
    personaPrompt: 'persona prompt', worldContext: 'world', keyRef: { type: 'server', keyId: 'mock-key' },
    signal: new AbortController().signal,
  })
}

// ===========================================================================
// 组 1:Stage 单元测试(正常 / 非 JSON / Markdown / 字段错误)
// ===========================================================================

{
  const llm = new MockLLM().enqueue({ content: JSON.stringify({ decision: 'send', intent: '回应用户', maintenance: 'immediate' }) })
  const { app, talk, session } = makeApp(llm)
  const result = await runStage(app, { talk, session }, 'contact-gate')
  assert.equal(result.decision, 'send')
  assert.equal(result.maintenance, 'immediate')
  console.log('组1a contact-gate 正常 JSON ✅')
}

{
  const llm = new MockLLM().enqueue({ content: '早安主人,今天也要努力哦' })
  const { app, talk, session } = makeApp(llm)
  await assert.rejects(() => runStage(app, { talk, session }, 'contact-gate'), /LLM 未返回 JSON/)
  assert.equal(llm.calls, 1) // 真实后端 validator 丢失 → 不 retry,前端校验失败 → stage 失败
  console.log('组1b 非 JSON → stage 失败(前端校验拒绝,不静默吞掉)✅')
}

{
  const llm = new MockLLM().enqueue({ content: '```json\n{"decision":"send","intent":"markdown","maintenance":"defer"}\n```' })
  const { app, talk, session } = makeApp(llm)
  const result = await runStage(app, { talk, session }, 'contact-gate')
  assert.equal(result.decision, 'send')
  console.log('组1c Markdown fence 正常归一化 ✅')
}

{
  // 字段错误(decision=hello 非法)→ 第一次失败 retry → 第二次成功 → calls=2(strict 模拟后端 validator 保留)
  const llm = new MockLLM()
    .enqueue({ content: JSON.stringify({ decision: 'hello', intent: 'x', maintenance: 'defer' }) })
    .enqueue({ content: JSON.stringify({ decision: 'wait', intent: '', maintenance: 'defer' }) })
  const { app, talk, session } = makeApp(llm, { strict: true })
  const result = await runStage(app, { talk, session }, 'contact-gate')
  assert.equal(result.decision, 'wait')
  assert.equal(llm.calls, 2)
  console.log('组1d 字段错误 → retry 后成功(calls=2,strict 模式)✅')
}

// ===========================================================================
// 组 2:Retry 测试(连续失败 → stage failed,不拖垮 session)
// ===========================================================================

{
  const llm = new MockLLM()
    .enqueue({ content: 'bad' })
    .enqueue({ content: 'bad' })
    .enqueue({ content: 'bad' })
  const { app, talk, session } = makeApp(llm, { strict: true })
  await assert.rejects(() => runStage(app, { talk, session }, 'contact-gate'))
  assert.equal(llm.calls, 3) // createRetrier(2) → 共 3 次尝试(strict 模式)
  console.log('组2 连续失败 → 3 次尝试后 stage 失败(session 未被拖入异常状态)✅')
}

// ===========================================================================
// 组 3:Pipeline 集成(用户消息正常流)
// ===========================================================================

{
  const llm = new MockLLM()
    .enqueue({ content: JSON.stringify({ decision: 'send', intent: '回应早安', maintenance: 'immediate' }) })
    .enqueue({ content: JSON.stringify({ content: '早安主人,庄园已打扫完毕' }) })
    .enqueue({ content: JSON.stringify({ state: '清晨,主厅,留琴刚问候主人' }) })
    .enqueue({ content: JSON.stringify({ add: [{ content: '主人今早心情不错' }], revise: [], forget: [] }) })
    .enqueue({ content: JSON.stringify({ create: [], cancel: [] }) })
  const { app, talk, session } = makeApp(llm)
  const run = await app.runPipeline({ userInitiated: true })
  assert.equal(run.status, 'completed')
  assert.equal(session.conversation.length, 1)
  assert.equal(session.conversation[0].content, '早安主人,庄园已打扫完毕')
  assert.equal(session.memory.length, 1)
  assert.ok(session.state.includes('清晨'))
  console.log('组3 用户消息正常流 → completed + conversation/memory/state 全更新 ✅')
}

// ===========================================================================
// 组 4:Stage Failure 注入(核心)
// ===========================================================================

// 4a:memory-reflection 失败 → 用户收到回复 + run=partial_success + memory deferred
{
  const llm = new MockLLM()
    .enqueue({ content: JSON.stringify({ decision: 'send', intent: '回应', maintenance: 'immediate' }) })
    .enqueue({ content: JSON.stringify({ content: '早安主人' }) })
    .enqueue({ content: JSON.stringify({ state: '主厅' }) })
    .enqueue({ content: '今天主人主动问候我' })  // memory 失败(非 JSON,前端校验拒绝)
    .enqueue({ content: JSON.stringify({ create: [], cancel: [] }) })
  const { app, talk, session } = makeApp(llm)
  const run = await app.runPipeline({ userInitiated: true })
  assert.equal(run.status, 'partial_success')           // 用户收到回复,维护部分失败
  assert.equal(run.maintenancePending, true)
  assert.equal(session.conversation.length, 1)          // 用户收到回复
  assert.equal(session.conversation[0].content, '早安主人')
  assert.equal(session.memory.length, 0)                // memory 未写入(失败)
  assert.ok(session.pendingMaintenance.some(p => p.stage === 'memory-reflection'))
  const stage = run.stages.find(s => s.stageId === 'memory-reflection')
  assert.equal(stage.status, 'deferred')
  console.log('组4a memory 失败 → 用户收到回复 + partial_success + deferred ✅')
}

// 4b:conversation-writer 失败 → fallback 消息(用户仍收到回复)
{
  const llm = new MockLLM()
    .enqueue({ content: JSON.stringify({ decision: 'send', intent: '留琴欲言又止', maintenance: 'defer' }) })
    .enqueue({ content: '早安主人(裸文本)' })  // conversation-writer 裸文本 → normalizer 兜底,非失败
  const { app, talk, session } = makeApp(llm)
  const run = await app.runPipeline({ userInitiated: true })
  assert.equal(run.status, 'completed')
  assert.equal(session.conversation.length, 1)
  assert.equal(session.conversation[0].content, '早安主人(裸文本)')
  console.log('组4b conversation 裸文本 → normalizer 兜底,用户收到内容 ✅')
}

// 4c:conversation-writer 完全失败(JSON 缺失且非裸文本可兜底路径外)→ fallback
{
  const llm = new MockLLM()
    .enqueue({ content: JSON.stringify({ decision: 'send', intent: '不知如何回应', maintenance: 'defer' }) })
    .enqueue({ content: '{ broken json' })  // 非裸文本、非合法 JSON → 失败
  const { app, talk, session } = makeApp(llm)
  const run = await app.runPipeline({ userInitiated: true })
  assert.equal(session.conversation.length, 1)
  assert.ok(session.conversation[0].content.includes('不知如何回应'))  // fallback = gate.intent
  assert.equal(session.conversation[0].degraded, true)
  console.log('组4c conversation 失败 → fallback(gate.intent),用户仍收到回复 ✅')
}

// ===========================================================================
// 组 5:Session 状态一致性(失败不半写入)
// ===========================================================================

{
  const llm = new MockLLM()
    .enqueue({ content: JSON.stringify({ decision: 'send', intent: '回应', maintenance: 'immediate' }) })
    .enqueue({ content: JSON.stringify({ content: '你好' }) })
    .enqueue({ content: 'bad json' })  // state-transition 失败
    .enqueue({ content: JSON.stringify({ add: [], revise: [], forget: [] }) })
    .enqueue({ content: JSON.stringify({ create: [], cancel: [] }) })
  const { app, talk, session } = makeApp(llm, { state: '厨房' })
  const run = await app.runPipeline({ userInitiated: true })
  assert.equal(run.status, 'partial_success')
  assert.equal(session.state, '厨房')  // state 保持旧值,未被污染
  assert.ok(session.pendingMaintenance.some(p => p.stage === 'state-transition'))
  console.log('组5 state 失败 → session.state 保持旧值(无半写入)✅')
}

// ===========================================================================
// 组 6:Clock / Plan(advanceSession 到期计划)
// ===========================================================================

{
  const { app, talk, session } = makeApp(new MockLLM(), { state: '主厅' })
  // 锚定会话时钟:真实 now → 会话 2026-08-10T09:00
  session.clock = {
    anchorRealAt: new Date().toISOString(), anchorSessionAt: '2026-08-10T09:00:00Z',
    offsetMs: 0, rate: 1, timezone: 'UTC',
  }
  session.plans = [
    { id: 'plan-1', action: '早餐完成', scheduledAt: '2026-08-10T08:30:00Z', expiresAt: null, stateEffect: '早餐已备好', contactIntent: 'none', status: 'pending', processedAt: null },
    { id: 'plan-2', action: '晚餐准备', scheduledAt: '2026-08-10T18:00:00Z', expiresAt: null, stateEffect: '', contactIntent: 'none', status: 'pending', processedAt: null },
  ]
  app.advanceSession(session)
  assert.equal(session.plans[0].status, 'completed')   // 到期 → completed
  assert.equal(session.plans[1].status, 'pending')     // 未到期 → 保持
  assert.ok(session.state.includes('早餐已备好'))        // stateEffect 应用
  assert.ok(session.events.some(e => e.type === 'plan_completed' && e.payload.planId === 'plan-1'))
  console.log('组6 advanceSession 到期计划 → completed + stateEffect + plan_completed 事件 ✅')
}

console.log('\n=== talk pipeline 全部测试通过(组1-6)===')
