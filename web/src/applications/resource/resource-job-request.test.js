import assert from 'node:assert/strict'
import { createResourceJobRequest, normalizeToolBody, validateToolBody } from './resource-job-request.js'
import { normalizePersona } from './persona-resource.js'

const fenced = '```javascript\nconst value = ctx.args.value;\nreturn { value };\n```'
assert.equal(normalizeToolBody(fenced), 'const value = ctx.args.value;\nreturn { value };')
assert.equal(validateToolBody(fenced).ok, true)
assert.equal(validateToolBody('ctx.logger.log("hello");').ok, false)
assert.match(validateToolBody('ctx.logger.log("hello");').errors[0], /return/)
assert.equal(validateToolBody('return { value: ;').ok, false)
assert.equal(validateToolBody('async function bad(ctx) { return {}; }').ok, false)

const request = createResourceJobRequest({ type: 'tool', resource: { name: '测试工具', description: '返回参数', args: '{ value }', content: '' } }, { generateToolPrompt: '名称：{{name}}\n{{globals}}', generateTemperature: 0.2, generateMaxTokens: 500 })
assert.match(request.messages[0].content, /ctx\.logger\.log/)
assert.match(request.messages[0].content, /必须使用 return/)
assert.equal(request.validate(fenced).value, 'const value = ctx.args.value;\nreturn { value };')
assert.deepEqual(normalizePersona({ id: 'legacy', name: '旧 Persona', sections: [] }).orchestrator, { summary: '', actions: [] })
assert.deepEqual(normalizePersona({ id: 'partial', name: '部分 Persona', sections: [], orchestrator: { summary: '能力' } }).orchestrator, { summary: '能力', actions: [] })
console.log('resource tool request tests passed')
