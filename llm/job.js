import { Provider } from "./provider.js";
import { Subject } from "rxjs";

/**
 * Runtime state machine for one provider request. It owns lifecycle events,
 * stream decoding, validation, and retry transitions, but not provider I/O.
 */

// --- State machine ---
const transitions = {
  idle: new Set(["running", "cancelled", "failed"]),
  running: new Set(["streaming", "validating", "cancelled", "failed"]),
  streaming: new Set(["validating", "completed", "cancelled", "failed"]),
  validating: new Set(["completed", "retrying", "cancelled", "failed"]),
  retrying: new Set(["running", "cancelled", "failed"]),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(),
};

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

// --- Response parsing ---

function tryParse(content, parse) {
  const result = parse(content);
  return (
    result && {
      content: result.body.trim(),
      cot: result.thoughts[0] || null,
      thoughts: result.thoughts,
    }
  );
}

function parseThinkTags(content) {
  const blocks = [...content.matchAll(/<think>([\s\S]*?)<\/think>\s*/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (blocks.length)
    return {
      body: content.replace(/<think>[\s\S]*?<\/think>\s*/gi, ""),
      thoughts: blocks,
    };
  const open = content.match(/^\s*<think>\s*/i);
  return (
    open && {
      body: "",
      thoughts: [content.slice(open[0].length).trim()].filter(Boolean),
    }
  );
}

function parseFencedThinking(content) {
  const complete = content.match(
    /^```(?:thinking|reasoning|思维链)\s*\n?([\s\S]*?)```\s*/i,
  );
  if (complete)
    return {
      body: content.slice(complete[0].length),
      thoughts: [complete[1].trim()].filter(Boolean),
    };
  const open = content.match(/^```(?:thinking|reasoning|思维链)\s*\n?/i);
  return (
    open && {
      body: "",
      thoughts: [content.slice(open[0].length).trim()].filter(Boolean),
    }
  );
}

function parseFinal(content) {
  const match = content.match(
    /^([\s\S]*?)(?:\n|^)(?:final(?: answer)?|最终答案|回答)\s*[:：]\s*([\s\S]+)/i,
  );
  return (
    match && { body: match[2], thoughts: [match[1].trim()].filter(Boolean) }
  );
}

function splitResponse(content) {
  // Some providers return reasoning inside the final content instead of a
  // dedicated delta field. Normalize known formats before exposing the answer.
  for (const parser of [parseThinkTags, parseFencedThinking, parseFinal]) {
    const result = tryParse(content, parser);
    if (result) return result;
  }
  return { content: String(content || "").trim(), cot: null, thoughts: [] };
}

// --- Response body iteration ---

async function* responseChunks(response, { signal } = {}) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("LLM 响应不包含流");
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } catch (error) {
    if (signal?.aborted && error.name !== "AbortError")
      throw new DOMException(signal.reason || "aborted", "AbortError");
    throw error;
  }
}

// --- LLM job lifecycle ---

export class LLMJob {
  #abortController = new AbortController();

  constructor(data = {}) {
    this.events = new Subject();
    Object.assign(this, data, {
      attempts: data.attempts || [],
      status: data.status || "idle",
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,
      responseText: data.responseText || "",
      reasoning: data.reasoning || "",
      toolCalls: data.toolCalls || [],
      error: data.error || null,
    });
  }
  transition(next) {
    if (!transitions[this.status]?.has(next))
      throw new Error(`LLMJob 无法从 ${this.status} 转为 ${next}`);
    this.status = next;
    if (["completed", "cancelled", "failed"].includes(next))
      this.completedAt ||= new Date().toISOString();
    this.events.next({ jobId: this.id, type: "state", state: next });
  }

  onEvent(listener) {
    listener({ jobId: this.id, type: "state", state: this.status });
    return this.events.subscribe(listener);
  }

  toJSON() {
    const { request } = this;
    return {
      id: this.id,
      keyId: this.keyId,
      status: this.status,
      request: {
        model: request.model,
        messages: copy(request.messages),
        tools: copy(request.tools || []),
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        thinking: request.thinking,
        stream: request.stream,
      },
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      responseText: this.responseText,
      reasoning: this.reasoning,
      toolCalls: copy(this.toolCalls || []),
      value: this.value === undefined ? undefined : copy(this.value),
      error: this.error,
      cancelReason: this.cancelReason,
      attempts: this.attempts.map((attempt) => copy(attempt)),
    };
  }

  abort(reason = "cancelled") {
    this.#abortController.abort(reason);
  }

  // --- Stream consumption ---

  async readStream(stream, format = "openai") {
    // Provider adapters differ in envelope format, but all are reduced to
    // content and reasoning deltas before callers receive updates.
    const decoder = new TextDecoder();
    let buffer = "",
      content = "",
      reasoning = "",
      toolCalls = [];
    this.responseText = "";
    this.reasoning = "";
    for await (const value of stream) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const data =
          format === "ollama"
            ? line.trim()
            : line.trim().startsWith("data:") && line.trim().slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          const delta = Provider.streamDelta(format, event);
          content += delta.content;
          reasoning += delta.reasoning;
          for (const call of delta.toolCalls || []) {
            const index = call.index ?? toolCalls.length;
            toolCalls[index] ||= {
              id: "",
              type: "function",
              function: { name: "", arguments: "" },
            };
            toolCalls[index].id ||= call.id || "";
            toolCalls[index].type = call.type || toolCalls[index].type;
            toolCalls[index].function.name += call.function?.name || "";
            toolCalls[index].function.arguments +=
              call.function?.arguments || "";
          }
          this.responseText += delta.content;
          this.reasoning += delta.reasoning;
          this.events.next({
            jobId: this.id,
            type: "delta",
            content: delta.content,
            reasoning: delta.reasoning || null,
          });
        } catch {}
      }
    }
    const result = reasoning
      ? {
          content,
          rawContent: content,
          reasoning,
          cot: reasoning,
          thoughts: [reasoning],
          toolCalls,
        }
      : {
          ...splitResponse(content),
          rawContent: content,
          reasoning: "",
          toolCalls,
        };
    this.responseText = result.rawContent;
    return result;
  }

  async readResponse(response, format) {
    const delta = Provider.responseContent(format, await response.json());
    this.responseText = delta.content;
    this.reasoning = delta.reasoning;
    this.events.next({
      jobId: this.id,
      type: "delta",
      content: delta.content,
      reasoning: delta.reasoning || null,
    });
    return delta.reasoning
      ? {
          content: delta.content,
          rawContent: delta.content,
          reasoning: delta.reasoning,
          cot: delta.reasoning,
          thoughts: [delta.reasoning],
          toolCalls: delta.toolCalls || [],
        }
      : {
          ...splitResponse(delta.content),
          rawContent: delta.content,
          reasoning: "",
          toolCalls: delta.toolCalls || [],
        };
  }

  // --- JobRequest execution ---
  async execute(key, request) {
    const signal = this.#abortController.signal;
    let lastError;
    for (let attempt = 1; ; attempt++) {
      let attemptRecord = null;
      try {
        if (this.status === "idle") this.transition("running");
        else if (this.status === "retrying") this.transition("running");
        this.startedAt ||= new Date().toISOString();
        const provider = Provider.get(key.provider);
        const prepared = provider.prepare(key, { request });
        const authorized = provider.authorize(prepared, key);
        const response = await globalThis.fetch(authorized.url, {
          ...authorized.init,
          signal,
        });
        attemptRecord = {
          input: prepared?.effectiveInput || request,
          requestedAt: new Date().toISOString(),
        };
        this.attempts.push(attemptRecord);
        if (!response.ok)
          throw new Error(
            `API ${response.status}: ${(await response.text()).slice(0, 200)}`,
          );
        if (request.stream) this.transition("streaming");
        const result = request.stream
          ? await this.readStream(
              responseChunks(response, { signal }),
              prepared.streamFormat,
            )
          : await this.readResponse(response, prepared.streamFormat);
        attemptRecord.responseText = result.rawContent;
        attemptRecord.reasoning = result.reasoning;
        this.transition("validating");
        // 推理模型(如 deepseek-v4-flash)偶发把最终 JSON 放进 reasoning_content 而非 content:
        // 先试 content;content 为空或校验失败且 reasoning 非空时用 reasoning 兜底,
        // 覆盖"content 有废话但无效、reasoning 含有效 JSON"的场景,避免误判失败。
        const contentText = String(result.content || "").trim();
        const reasoningText = String(result.reasoning || "").trim();
        let validation = request.validate(contentText);
        if (!validation.ok && reasoningText)
          validation = request.validate(reasoningText);
        if (validation.ok) {
          this.error = null;
          this.value = validation.value;
          this.transition("completed");
          this.toolCalls = result.toolCalls || [];
          this.events.next({
            jobId: this.id,
            type: "result",
            value: validation.value,
            rawText: result.rawContent,
            toolCalls: this.toolCalls,
          });
          return { ...result, value: validation.value };
        }
        lastError = new Error(validation.errors.join("; "));
        this.error = lastError.message;
        attemptRecord.validationErrors = validation.errors;
        if (
          !request.retry({
            output: result.content,
            errors: validation.errors,
            attempt,
          })
        )
          throw lastError;
        this.request = request;
        this.transition("retrying");
      } catch (error) {
        if (error.name === "AbortError") {
          this.cancelReason = signal?.reason?.message || error.message;
          if (!["cancelled", "completed"].includes(this.status))
            this.transition("cancelled");
          throw error;
        }
        lastError = error;
        this.error = error.message;
        if (attemptRecord) attemptRecord.error = error.message;
        if (!["failed", "completed", "cancelled"].includes(this.status))
          this.transition("failed");
        throw error;
      }
    }
  }
}
