import assert from 'node:assert/strict'
import { createOrchestratorJobRequest, validateOrchestratorParticipants } from './orchestrator-job-request.js'

const participant = { id: 'participant-1', personaId: 'child', api: { keyRefId: 'key-1' } }
const legacyPersona = { id: 'child', name: '小孩' }
assert.deepEqual(validateOrchestratorParticipants([{ participant, persona: legacyPersona }]), ['Persona「小孩」尚未配置 Orchestrator Action Contract'])
assert.throws(() => createOrchestratorJobRequest({ participants: [{ participant, persona: legacyPersona }], history: [], latestUserMessage: '你好' }, {}), /小孩.*Action Contract/)

const persona = { ...legacyPersona, orchestrator: { summary: '简单回应', actions: [{ id: 'reply', name: '回应', description: '', triggers: [], tools: [], inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, sideEffects: 'none' }] } }
assert.deepEqual(validateOrchestratorParticipants([{ participant, persona }]), [])
assert.doesNotThrow(() => createOrchestratorJobRequest({ participants: [{ participant, persona }], history: [], latestUserMessage: '你好' }, {}))
console.log('orchestrator request tests passed')
