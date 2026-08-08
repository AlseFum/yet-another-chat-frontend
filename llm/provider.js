/**
 * Provider adapters normalize a single internal chat-request shape into each
 * provider's endpoint, streaming format, and authorization convention. Adding
 * a provider should be isolated to this table and its preparation rules.
 */
// --- Provider adapters ---

const adapters = {
  "openai-compatible": {
    // OpenAI-compatible gateways do not consistently implement json_schema.
    // JobRequest validation/retry remains the portable strict-schema guarantee.
    id: "openai-compatible",
    label: "OpenAI Compatible",
    path: "/chat/completions",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: ["deepseek-v4-flash", "deepseek-chat"],
    requiresApiKey: true,
    streamFormat: "openai",
    prepare(key, job) {
      return prepare(this, key, job);
    },
    authorize(prepared, secret) {
      return authorize(prepared, { Authorization: `Bearer ${secret.apiKey}` });
    },
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    path: "/chat/completions",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModels: ["deepseek-chat", "deepseek-reasoner"],
    requiresApiKey: true,
    streamFormat: "openai",
    prepare(key, job) {
      return prepare(this, key, job);
    },
    authorize(prepared, secret) {
      return authorize(prepared, { Authorization: `Bearer ${secret.apiKey}` });
    },
  },
  "anthropic-messages": {
    id: "anthropic-messages",
    label: "Anthropic Messages",
    path: "/v1/messages",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModels: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
    requiresApiKey: true,
    streamFormat: "anthropic",
    prepare(key, job) {
      return prepare(this, key, job);
    },
    authorize(prepared, secret) {
      return authorize(prepared, {
        "x-api-key": secret.apiKey,
        "anthropic-version": "2023-06-01",
      });
    },
  },
  "gemini-generate-content": {
    id: "gemini-generate-content",
    label: "Gemini Generate Content",
    streamFormat: "gemini",
    path: "/v1beta/models",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModels: ["gemini-2.0-flash", "gemini-1.5-pro"],
    requiresApiKey: true,
    prepare(key, job) {
      return prepare(this, key, job);
    },
    authorize(prepared, secret) {
      return {
        ...prepared,
        init: { ...prepared.init },
        url: `${prepared.url}${prepared.url.includes("?") ? "&" : "?"}key=${encodeURIComponent(secret.apiKey)}`,
      };
    },
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    path: "/api/chat",
    defaultBaseUrl: "http://localhost:11434",
    defaultModels: [],
    requiresApiKey: false,
    streamFormat: "ollama",
    prepare(key, job) {
      return prepare(this, key, job);
    },
    authorize(prepared) {
      return prepared;
    },
  },
};

// --- Request normalization ---

function join(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  return base.endsWith(path) ? base : `${base}${path}`;
}

function normalizeInput(input = {}) {
  // The app accepts both JS-style and OpenAI-style token field names.
  const { maxTokens, max_tokens, ...rest } = input;
  const max = maxTokens ?? max_tokens;
  return { ...rest, ...(max !== undefined ? { max_tokens: max } : {}) };
}

// --- Provider request construction ---

function prepare(adapter, key, job) {
  const request = job.request || job;
  const body = normalizeInput({
    model: request.model,
    messages: request.messages,
    tools: request.tools,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    thinking: request.thinking,
    stream: request.stream,
  });
  // DeepSeek Reasoner rejects sampling parameters because its reasoning path
  // uses provider-controlled decoding.
  if (body.model === "deepseek-reasoner") delete body.temperature;
  const path =
    adapter.id === "gemini-generate-content"
      ? `${adapter.path}/${body.model}:generateContent`
      : adapter.path;
  return {
    streamFormat: adapter.streamFormat,
    effectiveInput: body,
    url: join(key.path || key.baseUrl || adapter.defaultBaseUrl, path),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(body),
      signal: null,
    },
  };
}

function authorize(prepared, headers) {
  return {
    ...prepared,
    init: {
      ...prepared.init,
      headers: { ...prepared.init.headers, ...headers },
    },
  };
}

// --- Provider stream normalization ---

function streamDelta(format, event) {
  if (format === "anthropic") {
    const delta = event.type === "content_block_delta" ? event.delta || {} : {};
    return { content: delta.text || "", reasoning: delta.thinking || "" };
  }
  if (format === "ollama")
    return {
      content: event.message?.content || event.response || "",
      reasoning: "",
    };
  const delta = event.choices?.[0]?.delta || {};
  return {
    content: delta.content || "",
    reasoning: delta.reasoning_content || delta.reasoning || "",
    toolCalls: delta.tool_calls || [],
  };
}

function responseContent(format, response) {
  if (format === "anthropic") {
    const blocks = response.content || [];
    return {
      content: blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join(""),
      reasoning: blocks
        .filter((block) => block.type === "thinking")
        .map((block) => block.thinking || "")
        .join(""),
    };
  }
  if (format === "ollama")
    return {
      content: response.message?.content || response.response || "",
      reasoning: "",
    };
  if (format === "gemini") {
    const parts = response.candidates?.[0]?.content?.parts || [];
    return {
      content: parts.map((part) => part.text || "").join(""),
      reasoning: "",
    };
  }
  const message = response.choices?.[0]?.message || {};
  return {
    content: message.content || "",
    reasoning: message.reasoning_content || message.reasoning || "",
    toolCalls: message.tool_calls || [],
  };
}

// --- Public adapter registry ---

export const Provider = Object.freeze({
  list: Object.freeze(
    Object.values(adapters).map(
      ({ id, label, defaultBaseUrl, defaultModels, requiresApiKey }) =>
        Object.freeze({
          id,
          label,
          defaultBaseUrl,
          defaultModels: Object.freeze([...defaultModels]),
          requiresApiKey,
        }),
    ),
  ),
  get: (id) => adapters[id] || adapters["openai-compatible"],
  streamDelta,
  responseContent,
});
