/**
 * Provider adapters normalize a single internal chat-request shape into each
 * provider's endpoint, streaming format, and authorization convention. Adding
 * a provider should be isolated to this table and its preparation rules.
 */
// --- Provider adapters ---

const adapters = {
  'openai-compatible': {
    // OpenAI-compatible gateways do not consistently implement json_schema.
    // JobRequest validation/retry remains the portable strict-schema guarantee.
    id: 'openai-compatible', label: 'OpenAI Compatible', path: '/chat/completions', defaultBaseUrl: 'https://api.openai.com/v1', defaultModels: ['deepseek-v4-flash', 'deepseek-chat'], streamFormat: 'openai', capabilities: { streaming: true, strictSchema: false, tools: true },
    prepare(key, job) { return prepare(this, key, job) },
    authorize(prepared, secret) { return authorize(prepared, { Authorization: `Bearer ${secret.apiKey}` }) },
  },
  'anthropic-messages': {
    id: 'anthropic-messages', label: 'Anthropic Messages', path: '/v1/messages', defaultBaseUrl: 'https://api.anthropic.com', defaultModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'], streamFormat: 'anthropic', capabilities: { streaming: true, strictSchema: false, tools: true },
    prepare(key, job) { return prepare(this, key, job) },
    authorize(prepared, secret) { return authorize(prepared, { 'x-api-key': secret.apiKey, 'anthropic-version': '2023-06-01' }) },
  },
  'gemini-generate-content': {
    id: 'gemini-generate-content', label: 'Gemini Generate Content', streamFormat: 'gemini', path: '/v1beta/models', defaultBaseUrl: 'https://generativelanguage.googleapis.com', defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro'], capabilities: { streaming: false, strictSchema: true, tools: true },
    prepare(key, job) { return prepare(this, key, job) },
    authorize(prepared, secret) { return { ...prepared, init: { ...prepared.init }, url: `${prepared.url}${prepared.url.includes('?') ? '&' : '?'}key=${encodeURIComponent(secret.apiKey)}` } },
  },
  ollama: {
    id: 'ollama', label: 'Ollama', path: '/api/chat', defaultBaseUrl: 'http://localhost:11434', defaultModels: [], streamFormat: 'ollama', capabilities: { streaming: true, strictSchema: false, tools: true },
    prepare(key, job) { return prepare(this, key, job) },
    authorize(prepared) { return prepared },
  },
}

// --- Request normalization ---

function join(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '')
  return base.endsWith(path) ? base : `${base}${path}`
}

function normalizeInput(input = {}) {
  // The app accepts both JS-style and OpenAI-style token field names.
  const { maxTokens, max_tokens, ...rest } = input
  const max = maxTokens ?? max_tokens
  return { ...rest, ...(max !== undefined ? { max_tokens: max } : {}) }
}

// --- Provider request construction ---

function prepare(adapter, key, job) {
  const request = job.request || job
  const body = normalizeInput(request.input || { model: request.model, messages: request.messages, maxTokens: request.maxTokens, temperature: request.temperature, stream: request.stream })
  // Only providers declaring strict-schema support receive response_format;
  // all outputs are still validated locally after streaming completes.
  if (adapter.capabilities.strictSchema && request.strictSchema) {
    body.response_format = { type: 'json_schema', json_schema: { name: 'result', strict: true, schema: request.strictSchema } }
  }
  const path = adapter.id === 'gemini-generate-content' ? `${adapter.path}/${body.model}:generateContent` : adapter.path
  return {
    capabilities: adapter.capabilities,
    streamFormat: adapter.streamFormat,
    effectiveInput: body,
    url: join(key.path || key.baseUrl || adapter.defaultBaseUrl, path),
    init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: null },
  }
}

function authorize(prepared, headers) {
  return { ...prepared, init: { ...prepared.init, headers: { ...prepared.init.headers, ...headers } } }
}

// --- Provider stream normalization ---

function streamDelta(format, event) {
  if (format === 'anthropic') {
    const delta = event.type === 'content_block_delta' ? event.delta || {} : {}
    return { content: delta.text || '', reasoning: delta.thinking || '' }
  }
  if (format === 'ollama') return { content: event.message?.content || event.response || '', reasoning: '' }
  const delta = event.choices?.[0]?.delta || {}
  return { content: delta.content || '', reasoning: delta.reasoning_content || delta.reasoning || '' }
}

// --- Public adapter registry ---

export const Provider = Object.freeze({
  list: Object.freeze(Object.values(adapters).map(({ id, label }) => ({ id, label }))),
  get: id => adapters[id] || adapters['openai-compatible'],
  streamDelta,
})
