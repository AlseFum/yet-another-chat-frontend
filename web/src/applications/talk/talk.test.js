import assert from 'node:assert/strict'
import { sessionNow, jumpSessionClock } from './talk-clock.js'
import { createSession, createTalk, normalizeTalk } from './talk-model.js'
import { compileTalkPersona } from './talk-persona-prompt.js'
import { createTalkStageJobRequest, planHorizon, validatePlanSchedule } from './talk-stage-job-request.js'
import { createTalkSessionContextJobRequest } from './talk-session-context-job-request.js'
import { buildTalkContext } from './talk-prompt.js'
import { TalkApplication } from './talk-application.js'

const clock = { anchorRealAt: '2026-01-01T00:00:00.000Z', anchorSessionAt: '2026-01-01T08:00:00.000Z', offsetMs: 0, rate: 2, timezone: 'Asia/Shanghai' }
assert.equal(sessionNow(clock, new Date('2026-01-01T01:00:00.000Z')), '2026-01-01T10:00:00.000Z')
jumpSessionClock(clock, '2026-02-01T00:00:00.000Z')
assert.equal(clock.anchorSessionAt, '2026-02-01T00:00:00.000Z')

const session = createSession('测试 Session')
assert.equal(session.conversation.length, 0)
const talk = createTalk({ name: '测试 Talk', personaId: 'persona-a', api: { keyRefId: 'key-a' } }, { model: 'model-a', temperature: 0.4, maxTokens: 1000, thinking: false, stream: true, activityEnabled: true, minReplyIntervalMinutes: 30, maxProactivePerSession: 2 })
assert.equal(talk.requestOptions.model, 'model-a')
assert.equal(talk.sessions.length, 1)
assert.equal(talk.sessions[0].name, '初始频道')
const renamedTalk = normalizeTalk({ worldContext: {}, sessions: [{ name: '初始时段' }, { name: 'Session 2' }, { name: '周末闲聊' }] })
assert.deepEqual(renamedTalk.sessions.map(item => item.name), ['初始频道', '频道 2', '周末闲聊'])

const entered = new TalkApplication()
entered.talks = [talk]
entered.ui.activeTalkId = talk.id
entered.ui.activeSessionId = talk.sessions[0].id
entered.workspace = { state: { set() {} }, saveState: async () => {} }
let entryTrigger = null
entered.runPipeline = async options => { entryTrigger = options.trigger; return options }
await entered.enterActiveSession()
assert.equal(entryTrigger, 'entry')
assert.equal(entered.activeSession.events.at(-1).type, 'session_opened')

let releases = 0
const workspace = { resources: { borrow(type, id) { assert.equal(type, 'text'); assert.equal(id, 'text-a'); return { ok: true, value: { read: () => ({ content: '引用内容' }), release: () => { releases++ } } } } } }
const persona = { id: 'persona-a', name: '角色', sections: [['通用', '通用内容'], ['[chat]聊天', '排除'], ['[talk:private]内心', '@text-a'], ['[talk:public]公开', '公开内容']], orchestrator: { summary: '', actions: [] } }
const prompt = await compileTalkPersona(persona, workspace)
assert.match(prompt, /通用内容/); assert.match(prompt, /引用内容/); assert.match(prompt, /公开内容/); assert.doesNotMatch(prompt, /排除/); assert.equal(releases, 1)

const request = createTalkStageJobRequest({ stageId: 'contact-gate', context: { persona: prompt }, requestOptions: { model: 'model-a' } }, { contactGatePrompt: '{{instruction}}\n{{context}}\n{{outputSchema}}' })
assert.equal(request.model, 'model-a')
assert.equal(request.validate('{"decision":"wait","intent":"","maintenance":"defer"}').ok, true)
assert.equal(request.validate('{"decision":"invalid","intent":"","maintenance":"defer"}').ok, false)
assert.equal(request.validate('{"decision":"send","intent":"","maintenance":"defer"}').ok, false)
assert.equal(request.validate('{"decision":"send","intent":"分享刚完成的事情并自然开启话题","maintenance":"defer"}').ok, true)
assert.match(request.messages[0].content, /主动开始一个新话题/)
assert.match(request.messages[0].content, /必须是该轮第一个 LLM Stage/)
const userGateContext = buildTalkContext(session, 'persona', 'world', '2026-01-01T08:00:00.000Z', { enabled: false }, { trigger: 'user', userInitiated: true, stageIsFirstLLMStage: true })
assert.deepEqual(userGateContext.pipelineContext, { trigger: 'user', userInitiated: true, stageIsFirstLLMStage: true })
const planContext = { sessionNow: '2026-01-01T08:00:00.000Z' }
const planRequest = createTalkStageJobRequest({ stageId: 'plan-manager', context: planContext, requestOptions: {} }, { planManagerPrompt: '自定义模板，不包含 instruction 变量。' })
assert.match(planRequest.messages[0].content, /即时计划/)
assert.match(planRequest.messages[0].content, /允许多个计划集中在同一小时或同一天/)
assert.match(planRequest.messages[0].content, /允许为了形成长短搭配补充计划/)
assert.equal(planHorizon('2026-01-01T08:08:00.000Z', planContext.sessionNow), 'immediate')
assert.equal(planHorizon('2026-01-01T10:00:00.000Z', planContext.sessionNow), 'near')
assert.equal(planHorizon('2026-01-03T08:00:00.000Z', planContext.sessionNow), 'scheduled')
assert.equal(planHorizon('2026-01-08T08:00:00.000Z', planContext.sessionNow), 'long')
assert.deepEqual(validatePlanSchedule([{ scheduledAt: '2026-01-01T09:00:00.000Z' }, { scheduledAt: '2026-01-01T10:00:00.000Z' }], planContext.sessionNow), ['创建两个及以上计划时，必须覆盖至少两个时间尺度：即时（30分钟内）、近期（6小时内）、日程（3天内）或长期（3天以上）'])
const variedPlans = JSON.stringify({ create: [{ action: '完成手头工作', scheduledAt: '2026-01-01T10:00:00.000Z', stateEffect: '完成了手头工作。', contactIntent: 'none' }, { action: '参加下周预约', scheduledAt: '2026-01-08T08:00:00.000Z', stateEffect: '参加了预约。', contactIntent: 'consider' }], cancel: [] })
assert.equal(planRequest.validate(variedPlans).ok, true)
const clusteredPlans = JSON.stringify({ create: [{ action: '事项一', scheduledAt: '2026-01-01T09:00:00.000Z', stateEffect: '完成事项一。', contactIntent: 'none' }, { action: '事项二', scheduledAt: '2026-01-01T10:00:00.000Z', stateEffect: '完成事项二。', contactIntent: 'none' }], cancel: [] })
assert.equal(planRequest.validate(clusteredPlans).ok, false)
const sameHourVariedPlans = JSON.stringify({ create: [{ action: '十分钟后关火', scheduledAt: '2026-01-01T08:10:00.000Z', stateEffect: '关掉了炉火。', contactIntent: 'none' }, { action: '五十分钟后出门', scheduledAt: '2026-01-01T08:50:00.000Z', stateEffect: '离开家出门办事。', contactIntent: 'none' }], cancel: [] })
assert.equal(planRequest.validate(sameHourVariedPlans).ok, true)
const contextRequest = createTalkSessionContextJobRequest({ persona: '角色 A', worldContext: '世界 B', guidance: '说明 C', requestOptions: {} }, { sessionContextPrompt: '{{persona}} / {{worldContext}} / {{guidance}}' })
assert.match(contextRequest.messages[0].content, /角色 A \/ 世界 B \/ 说明 C/)
console.log('talk application tests passed')
