import assert from 'node:assert/strict'
import { extractAssistantText } from './chat-application.js'
import { createActorActionJobRequest } from './orchestrator-job-request.js'

// ===========================================================================
// 层 1:消息转换层 extractAssistantText(actor envelope → assistant.content)
// 协议:response 是唯一用户可见通道;result.reply/response/content 是旧输出兼容(带 warning)。
// ===========================================================================

// Case 1:response 正常
assert.equal(extractAssistantText({ response: '你好', result: { count: 1 } }), '你好')

// Case 2:response 优先于 result.reply(不能误用备用文本)
assert.equal(
  extractAssistantText({ response: '第七十三次……还要继续吗……', result: { reply: '错误备用文本', count: 74 } }),
  '第七十三次……还要继续吗……',
)

// Case 3:旧模型兼容 result.reply
assert.equal(
  extractAssistantText({ result: { reply: '主人……我已经数到七十四次了……', emotion: '害羞', count: 74 } }),
  '主人……我已经数到七十四次了……',
)

// Case 4:result.response 兼容
assert.equal(extractAssistantText({ result: { response: '你好', count: 1 } }), '你好')

// Case 5:result.content 兼容
assert.equal(extractAssistantText({ result: { content: '测试消息' } }), '测试消息')

// Case 6:纯结构化 result——不能误把状态字段当聊天,仍 JSON 化展示
assert.equal(extractAssistantText({ result: { count: 74, progress: 'still counting' } }), '{\n  "count": 74,\n  "progress": "still counting"\n}')

// Case 7:空信封
assert.equal(extractAssistantText({}), '')

// ===========================================================================
// 层 2:Actor schema 协议校验(completed 必须 response)
// ===========================================================================

const action = {
  id: 'respond',
  name: '回应',
  description: '回应主人',
  triggers: [],
  tools: [],
  inputSchema: { type: 'object', properties: {} },
  outputSchema: { type: 'object', properties: {} },
  sideEffects: 'none',
}
const request = createActorActionJobRequest(
  { personaPrompt: 'persona', userMaskPrompt: '', history: [], participantId: 'participant-1', action, context: {} },
  {},
)

// 正常:completed + response → 通过
const ok = request.validate(
  JSON.stringify({ participantId: 'participant-1', actionId: 'respond', status: 'completed', response: '你好', result: { count: 1 } }),
)
assert.equal(ok.ok, true)

// 非法:completed + 缺 response(对话塞 result)→ 协议层拦截
const bad = request.validate(
  JSON.stringify({ participantId: 'participant-1', actionId: 'respond', status: 'completed', result: { reply: '你好' } }),
)
assert.equal(bad.ok, false)
assert.match(bad.errors[0], /response 字段/)

// blocked/abstain 不需要 response(envelope 仍要求 result 字段,给 null)
const blocked = request.validate(
  JSON.stringify({ participantId: 'participant-1', actionId: 'respond', status: 'blocked', result: null, reason: '无法执行' }),
)
assert.equal(blocked.ok, true)

// ===========================================================================
// 层 3:端到端展示行为(经 runActorAction 转换链)
// 说明:runActorAction 依赖 workspace/createJob,这里用 extractAssistantText 验证
// 转换链核心(assistant.content = extractAssistantText(value));完整端到端由手动实测覆盖。
// ===========================================================================

// 模拟 runActorAction 的 content 赋值链:value → extractAssistantText → assistant.content
const simulate = (value) => extractAssistantText(value)
assert.equal(simulate({ response: '留琴的话', result: { count: 74 } }), '留琴的话')
assert.equal(simulate({ result: { reply: '旧格式回复' } }), '旧格式回复')
assert.equal(simulate({ result: { count: 74 } }), '{\n  "count": 74\n}')

console.log('actor protocol tests passed(层1 转换 ×7 + 层2 校验 ×3 + 层3 转换链 ×3)')
