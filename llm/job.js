import { Provider } from './provider.js'

/**
 * Runtime state machine for one provider request. It owns lifecycle events,
 * stream decoding, validation, and retry transitions, but not provider I/O.
 */

// --- Event bus ---

export class EventBus {
  #listeners = new Set()

  subscribe(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  emit(event) {
    const payload = this.eventPayload(event)
    for (const listener of this.#listeners) listener(payload)
  }

  eventPayload(event) { return event }
}

// --- State machine ---
const transitions = {
  queued: new Set(['running', 'cancelled', 'failed']),
  running: new Set(['streaming', 'cancelled', 'failed']),
  streaming: new Set(['validating', 'completed', 'cancelled', 'failed']),
  validating: new Set(['completed', 'retrying', 'cancelled', 'failed']),
  retrying: new Set(['running', 'cancelled', 'failed']),
  completed: new Set(), cancelled: new Set(), failed: new Set(),
}

export class StateMachine extends EventBus {
  #transitions

  constructor({ state, transitions }) {
    if (new.target === StateMachine) throw new TypeError('StateMachine 是抽象类，不能直接实例化')
    super()
    this.status = state
    this.#transitions = transitions
  }

  transition(next) {
    if (!this.#transitions[this.status]?.has(next)) throw new Error(`${this.constructor.name} 无法从 ${this.status} 转为 ${next}`)
    this.status = next
    this.afterTransition(next)
    this.emit({ type: 'state', state: next })
  }

  afterTransition() {}
}

// --- Response parsing ---

function tryParse(content, parse) {
  const result = parse(content)
  return result && { content: result.body.trim(), cot: result.thoughts[0] || null, thoughts: result.thoughts }
}

function parseThinkTags(content) {
  const blocks = [...content.matchAll(/<think>([\s\S]*?)<\/think>\s*/gi)].map(match => match[1].trim()).filter(Boolean)
  if (blocks.length) return { body: content.replace(/<think>[\s\S]*?<\/think>\s*/gi, ''), thoughts: blocks }
  const open = content.match(/^\s*<think>\s*/i)
  return open && { body: '', thoughts: [content.slice(open[0].length).trim()].filter(Boolean) }
}

function parseFencedThinking(content) {
  const complete = content.match(/^```(?:thinking|reasoning|思维链)\s*\n?([\s\S]*?)```\s*/i)
  if (complete) return { body: content.slice(complete[0].length), thoughts: [complete[1].trim()].filter(Boolean) }
  const open = content.match(/^```(?:thinking|reasoning|思维链)\s*\n?/i)
  return open && { body: '', thoughts: [content.slice(open[0].length).trim()].filter(Boolean) }
}

function parseFinal(content) {
  const match = content.match(/^([\s\S]*?)(?:\n|^)(?:final(?: answer)?|最终答案|回答)\s*[:：]\s*([\s\S]+)/i)
  return match && { body: match[2], thoughts: [match[1].trim()].filter(Boolean) }
}

function splitResponse(content) {
  // Some providers return reasoning inside the final content instead of a
  // dedicated delta field. Normalize known formats before exposing the answer.
  for (const parser of [parseThinkTags, parseFencedThinking, parseFinal]) {
    const result = tryParse(content, parser)
    if (result) return result
  }
  return { content: String(content || '').trim(), cot: null, thoughts: [] }
}

// --- Response body iteration ---

async function* responseChunks(response, { signal } = {}) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('LLM 响应不包含流')
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield value
    }
  } catch (error) {
    if (signal?.aborted && error.name !== 'AbortError') throw new DOMException(signal.reason || 'aborted', 'AbortError')
    throw error
  }
}

// --- LLM job lifecycle ---

export class LLMJob extends StateMachine {
  constructor(data = {}) {
    super({ state: data.status || 'queued', transitions })
    Object.assign(this, data, {
      input: data.input || data.request?.body || {},
      contract: data.contract || { type: 'text' },
      attempts: data.attempts || [],
      status: data.status || 'queued',
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,
      upstream: data.upstream || null,
      responseText: data.responseText || '',
      error: data.error || null,
    })
  }

  // --- Events and persistence ---

  eventPayload(event) { return { jobId: this.id, ...event } }

  toJSON() { return { ...this } }

  afterTransition(next) {
    if (['completed', 'cancelled', 'failed'].includes(next)) this.completedAt ||= new Date().toISOString()
  }

  // --- Stream consumption ---

  async readStream(stream, { format = this.streamFormat || 'openai', onChunk } = {}) {
    // Provider adapters differ in envelope format, but all are reduced to
    // content and reasoning deltas before callers receive updates.
    const decoder = new TextDecoder()
    let buffer = '', content = '', reasoning = ''
    for await (const value of stream) {
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const data = format === 'ollama' ? line.trim() : line.trim().startsWith('data:') && line.trim().slice(5).trim()
        if (!data || data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          const delta = Provider.streamDelta(format, event)
          content += delta.content
          reasoning += delta.reasoning
          this.responseText += delta.content
          onChunk?.({ content, rawContent: content, cot: reasoning || null, thoughts: reasoning ? [reasoning] : [] })
          this.emit({ type: 'delta', content: delta.content, reasoning: delta.reasoning || null })
        } catch {}
      }
    }
    const result = reasoning ? { content, rawContent: content, cot: reasoning, thoughts: [reasoning] } : { ...splitResponse(content), rawContent: content }
    this.responseText = result.rawContent
    return result
  }

  // --- JobRequest execution ---
  async execute(transport, apiConfig, request, { signal, onChunk } = {}) {
    let lastError
    for (let attempt = 1; ; attempt++) {
      let attemptRecord = null
      try {
        if (this.status === 'queued') this.transition('running')
        else if (this.status === 'retrying') this.transition('running')
        this.startedAt ||= new Date().toISOString()
        const { response, prepared } = await transport({ key: apiConfig, job: { request }, signal })
        this.transition('streaming')
        this.upstream = { status: response.status, contentType: response.headers.get('content-type') || null }
        this.streamFormat = prepared?.streamFormat || 'openai'
        attemptRecord = { input: prepared?.effectiveInput || request, requestedAt: new Date().toISOString() }
        this.attempts.push(attemptRecord)
        if (!response.ok) throw new Error(`API ${response.status}: ${(await response.text()).slice(0, 200)}`)
        const result = await this.readStream(responseChunks(response, { signal }), { onChunk })
        attemptRecord.responseText = result.rawContent
        this.transition('validating')
        const validation = request.validate(result.content)
        if (validation.ok) {
          this.error = null
          this.value = validation.value
          this.transition('completed')
          this.emit({ type: 'result', value: validation.value, rawText: result.rawContent })
          return { ...result, value: validation.value }
        }
        lastError = new Error(validation.errors.join('; '))
        this.error = lastError.message
        attemptRecord.validationErrors = validation.errors
        if (!request.retry({ output: result.content, errors: validation.errors, attempt })) throw lastError
        this.request = request.toJSON()
        this.transition('retrying')
      } catch (error) {
        if (error.name === 'AbortError') {
          this.cancelReason = signal?.reason?.message || error.message
          if (!['cancelled', 'completed'].includes(this.status)) this.transition('cancelled')
          throw error
        }
        lastError = error
        this.error = error.message
        if (attemptRecord) attemptRecord.error = error.message
        if (!['failed', 'completed', 'cancelled'].includes(this.status)) this.transition('failed')
        throw error
      }
    }
    throw lastError
  }

}
