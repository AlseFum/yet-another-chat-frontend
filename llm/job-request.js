/**
 * Provider-neutral request plus executable validation and retry policies.
 */

// --- JSON and schema validation ---

function extractJSON(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM 未返回 JSON 对象");
  try {
    return JSON.parse(
      cleaned.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1"),
    );
  } catch (error) {
    throw new Error(`无法解析 LLM JSON: ${error.message}`);
  }
}

function validateSchema(value, schema, path = "$") {
  if (!schema) return [];
  const errors = [];
  const type = Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : typeof value;
  const acceptedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  if (acceptedTypes.length && !acceptedTypes.includes(type))
    errors.push(`${path} 应为 ${acceptedTypes.join(" 或 ")}，实际为 ${type}`);
  if (schema.enum && !schema.enum.includes(value))
    errors.push(
      `${path} 必须是 ${schema.enum.map((item) => JSON.stringify(item)).join("、")} 之一`,
    );
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push(`${path} 至少需要 ${schema.minLength} 个字符`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      errors.push(`${path} 不能超过 ${schema.maxLength} 个字符`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value)))
      errors.push(`${path} 必须是 ISO 8601 时间`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${path} 不能小于 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${path} 不能大于 ${schema.maximum}`);
  }
  if (
    schema.type === "object" &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    for (const key of schema.required || [])
      if (!(key in value)) errors.push(`${path}.${key} 为必填字段`);
    for (const [key, child] of Object.entries(schema.properties || {}))
      if (key in value)
        errors.push(...validateSchema(value[key], child, `${path}.${key}`));
    if (schema.additionalProperties === false)
      for (const key of Object.keys(value))
        if (!(key in (schema.properties || {})))
          errors.push(`${path}.${key} 不允许额外字段`);
  }
  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${path} 至少需要 ${schema.minItems} 项`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push(`${path} 最多只能有 ${schema.maxItems} 项`);
    if (schema.items)
      value.forEach((item, index) =>
        errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)),
      );
  }
  return errors;
}

// --- Validator factories ---

export function createSchemaValidator(schema) {
  const validator = (text) => {
    try {
      const value = extractJSON(text);
      const errors = validateSchema(value, schema);
      return errors.length ? { ok: false, errors } : { ok: true, value };
    } catch (error) {
      return { ok: false, errors: [error.message] };
    }
  };
  return validator;
}

export function createJSONValidator() {
  const validator = (text) => {
    try {
      return { ok: true, value: extractJSON(text) };
    } catch (error) {
      return { ok: false, errors: [error.message] };
    }
  };
  return validator;
}

// --- Retry policy factories ---

export function createRetrier(maxRetries = 2) {
  return ({ messages, output, errors, attempt }) => {
    if (attempt > maxRetries) return null;
    return [
      ...messages,
      { role: "assistant", content: output },
      {
        role: "user",
        content: `审核你刚才的回答并修复校验错误：${errors.join("；")}。只返回修复后的结果。`,
      },
    ];
  };
}

// --- Request model ---

export class JobRequest {
  constructor({
    messages = [],
    tools = [],
    model,
    maxTokens = 4096,
    temperature = 0.7,
    thinking = null,
    validator = null,
    retrier = null,
    stream = true,
  } = {}) {
    this.messages = Array.isArray(messages) ? messages : [];
    this.tools = Array.isArray(tools) ? tools : [];
    this.model = model;
    this.maxTokens = Number(maxTokens) || 4096;
    this.temperature = Number.isFinite(Number(temperature))
      ? Number(temperature)
      : 0.7;
    this.thinking =
      thinking === true
        ? { type: "enabled" }
        : thinking?.type === "enabled"
          ? { type: "enabled" }
          : null;
    this.validator = validator;
    this.retrier = retrier;
    this.stream = stream !== false;
  }

  validate(text) {
    return this.validator ? this.validator(text) : { ok: true, value: text };
  }

  retry(context) {
    const messages = this.retrier?.({ messages: this.messages, ...context });
    if (!messages) return false;
    this.messages = messages;
    return true;
  }
}
