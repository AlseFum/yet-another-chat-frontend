import assert from 'node:assert/strict'
import { createSession, normalizeTalk } from './talk-model.js'
import { TalkApplication } from './talk-application.js'

// ---- T1:session 结构 ----
const session = createSession('测试频道')
assert.deepEqual(session.pendingMaintenance, [])
assert.ok(Array.isArray(session.pendingMaintenance))

// 旧 session 兼容
const legacySession = { id: 's1', name: '旧频道', memory: [], plans: [], conversation: [], events: [], runs: [] }
const normalized = normalizeTalk({ id: 't1', name: 't', sessions: [legacySession] })
assert.deepEqual(normalized.sessions[0].pendingMaintenance, [])

// ---- T2:deferMaintenance 纯逻辑 ----
const app = new TalkApplication()
const run = {
  id: 'run-1', status: 'running', stages: [
    { stageId: 'state-transition', status: 'completed' },
    { stageId: 'memory-reflection', status: 'running' },
  ],
}
const sess = createSession('s')
app.deferMaintenance(run, sess, 'memory-reflection', 'invalid json')

// entry 标记 deferred
assert.equal(run.stages[1].status, 'deferred')
assert.equal(run.stages[1].error, 'invalid json')
// 队列入队
assert.equal(sess.pendingMaintenance.length, 1)
assert.equal(sess.pendingMaintenance[0].stage, 'memory-reflection')
// run 标记
assert.equal(run.maintenancePending, true)

// 重复失败不重复入队(更新 reason)
run.stages.push({ stageId: 'plan-manager', status: 'running' })
app.deferMaintenance(run, sess, 'plan-manager', 'reason A')
app.deferMaintenance(run, sess, 'plan-manager', 'reason B')
assert.equal(sess.pendingMaintenance.length, 2)
assert.equal(sess.pendingMaintenance.find(p => p.stage === 'plan-manager').reason, 'reason B')

// 已完成的 stage 不被误标
assert.equal(run.stages[0].status, 'completed')

console.log('talk recovery tests passed(结构兼容 + deferMaintenance)')
