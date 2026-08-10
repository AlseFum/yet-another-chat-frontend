import {
  createRetrier,
  createSchemaValidator,
  JobRequest,
} from "../../../../llm/index.js";
import { TALK_STAGES } from "./talk-prompt.js";
const replace = (template, values) =>
  String(template || "").replace(/\{\{(\w+)\}\}/g, (raw, key) =>
    key in values ? String(values[key]) : raw,
  );
export function createTalkStageJobRequest(
  { stageId, context, requestOptions },
  customSetting = {},
) {
  const stage = TALK_STAGES.find((item) => item.id === stageId);
  if (!stage) throw new Error(`未知 Talk Stage ${stageId}`);
  const instructionKey = `${stageId.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Instruction`;
  const instruction = String(
    customSetting[instructionKey] || stage.instruction,
  );
  const values = {
    stage: stage.title,
    instruction,
    context: JSON.stringify(context),
    outputSchema: JSON.stringify(stage.schema),
  };
  const template =
    customSetting[
      `${stageId.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Prompt`
    ] ||
    "{{instruction}}\n\n上下文：{{context}}\n\n输出 Schema：{{outputSchema}}";
  const schemaValidator = createSchemaValidator(stage.schema);
  const validator = (text) => {
    const result = schemaValidator(text);
    if (!result.ok) return result;
    if (stageId === "contact-gate") {
      const errors = [];
      if (
        result.value.decision === "send" &&
        !String(result.value.intent || "").trim()
      )
        errors.push("Contact Gate 选择 send 时必须提供具体 intent");
      if (
        result.value.decision === "wait" &&
        String(result.value.intent || "").trim()
      )
        errors.push("Contact Gate 选择 wait 时 intent 必须为空");
      return errors.length ? { ok: false, errors } : result;
    }
    if (stageId !== "plan-manager") return result;
    const errors = validatePlanSchedule(
      result.value.create,
      context.sessionNow,
    );
    return errors.length ? { ok: false, errors } : result;
  };
  const customInstruction =
    instruction === stage.instruction ? "" : `自定义阶段说明：\n${instruction}`;
  const system = [
    "你是持续性 Talk Runtime 的一个窄职责阶段。Persona 不可改写。不要在分析过程中构造最终 JSON——最终 JSON 只允许出现在最终回复中,直接输出符合 Schema 的 JSON,不要输出解释文字或 Markdown。",
    `代码内置阶段契约：\n${stage.instruction}`,
    customInstruction,
  ]
    .filter(Boolean)
    .join("\n\n");
  return new JobRequest({
    ...requestOptions,
    messages: [
      { role: "system", content: system },
      { role: "user", content: replace(template, values) },
    ],
    validator,
    retrier: createRetrier(2),
  });
}

export function planHorizon(scheduledAt, sessionNow) {
  const delay = Date.parse(scheduledAt) - Date.parse(sessionNow);
  if (!Number.isFinite(delay) || delay <= 0) return "invalid";
  if (delay <= 30 * 60 * 1000) return "immediate";
  if (delay <= 6 * 60 * 60 * 1000) return "near";
  if (delay <= 3 * 24 * 60 * 60 * 1000) return "scheduled";
  return "long";
}

export function validatePlanSchedule(plans, sessionNow) {
  const horizons = (plans || []).map((plan) =>
    planHorizon(plan.scheduledAt, sessionNow),
  );
  const errors = [];
  if (horizons.includes("invalid"))
    errors.push("所有新计划的 scheduledAt 都必须晚于 sessionNow");
  const validHorizons = new Set(
    horizons.filter((horizon) => horizon !== "invalid"),
  );
  if (plans?.length >= 2 && validHorizons.size < 2)
    errors.push(
      "创建两个及以上计划时，必须覆盖至少两个时间尺度：即时（30分钟内）、近期（6小时内）、日程（3天内）或长期（3天以上）",
    );
  return errors;
}
