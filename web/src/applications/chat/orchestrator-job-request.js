import {
  JobRequest,
  createRetrier,
  createSchemaValidator,
} from "../../../../llm/index.js";

const jobOptions = (requestOptions = {}) => ({
  model: requestOptions.model,
  temperature: requestOptions.temperature,
  maxTokens: requestOptions.maxTokens,
  thinking: requestOptions.thinking,
  stream: requestOptions.stream,
});

export function validateOrchestratorParticipants(participants) {
  const errors = [];
  for (const item of participants || []) {
    const participantId = item?.participant?.id || "未知实例";
    const persona = item?.persona;
    if (!persona) {
      errors.push(`实例 ${participantId} 引用了不存在的 Persona`);
      continue;
    }
    if (!persona.orchestrator || typeof persona.orchestrator !== "object") {
      errors.push(
        `Persona「${persona.name || persona.id}」尚未配置 Orchestrator Action Contract`,
      );
      continue;
    }
    if (
      !Array.isArray(persona.orchestrator.actions) ||
      !persona.orchestrator.actions.length
    ) {
      errors.push(
        `Persona「${persona.name || persona.id}」至少需要声明一个 Action`,
      );
    }
  }
  return errors;
}

export function createOrchestratorJobRequest(
  {
    systemPrompt,
    userMaskPrompt,
    history,
    participants,
    latestUserMessage,
    prompt,
  },
  requestOptions,
) {
  const participantErrors = validateOrchestratorParticipants(participants);
  if (participantErrors.length) throw new Error(participantErrors.join("；"));
  const contracts = participants.map(({ participant, persona }) => ({
    participantId: participant.id,
    personaId: persona.id,
    name: participant.alias || persona.name,
    summary: persona.orchestrator.summary,
    actions: persona.orchestrator.actions.map((action) => ({
      id: action.id,
      name: action.name,
      description: action.description,
      triggers: action.triggers,
      inputSchema: action.inputSchema,
      allowedTools: action.tools,
      sideEffects: action.sideEffects,
    })),
  }));
  const instruction = [
    systemPrompt,
    userMaskPrompt,
    prompt,
    "你是控制平面，不是聊天角色，不得直接回答用户。根据 Persona Action 契约决定哪些实例可以行动，并为每个实例编译最小必要 Context。",
    `可用行动契约：\n${JSON.stringify(contracts, null, 2)}`,
    `历史：\n${JSON.stringify(history, null, 2)}`,
    `最新用户输入：\n${latestUserMessage}`,
    "直接在最终回复中输出 JSON，不要在分析过程中构造最终 JSON——必须包含 status、dispatches、reason 三个字段。status=dispatch 时 dispatches 至少一项；status=wait 或 finish 时 dispatches 必须为空。context 必须符合对应 Action inputSchema。reason 必须用一句话说明本轮调度/等待/结束的理由。",
  ]
    .filter(Boolean)
    .join("\n\n");
  const validator = createSchemaValidator({
    type: "object",
    required: ["status", "dispatches", "reason"],
    properties: {
      status: { type: "string", enum: ["dispatch", "wait", "finish"] },
      reason: { type: "string" },
      dispatches: {
        type: "array",
        items: {
          type: "object",
          required: ["participantId", "actionId", "context"],
          properties: {
            participantId: { type: "string" },
            // 模型可能携带契约中的冗余字段(personaId/name),允许但忽略
            personaId: { type: "string" },
            name: { type: "string" },
            actionId: { type: "string" },
            context: { type: "object" },
            allowedTools: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
      },
      required: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "reason"],
          properties: { name: { type: "string" }, reason: { type: "string" } },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  });
  return new JobRequest({
    ...jobOptions(requestOptions),
    messages: [{ role: "user", content: instruction }],
    validator,
    retrier: createRetrier(2),
  });
}

export function validateOrchestratorDecision(decision, participants) {
  const errors = validateOrchestratorParticipants(participants);
  if (decision.status === "dispatch" && !decision.dispatches.length)
    errors.push("dispatch 至少需要一个行动");
  if (decision.status !== "dispatch" && decision.dispatches.length)
    errors.push(`${decision.status} 不能包含 dispatches`);
  const seen = new Set();
  for (const dispatch of decision.dispatches) {
    const participant = participants.find(
      (item) => item.participant.id === dispatch.participantId,
    );
    const action = participant?.persona?.orchestrator?.actions?.find(
      (item) => item.id === dispatch.actionId,
    );
    if (!participant)
      errors.push(`不存在 participant ${dispatch.participantId}`);
    else if (!action)
      errors.push(
        `participant ${dispatch.participantId} 不支持 Action ${dispatch.actionId}`,
      );
    else {
      const contextValidation = createSchemaValidator(action.inputSchema)(
        JSON.stringify(dispatch.context),
      );
      if (!contextValidation.ok) errors.push(...contextValidation.errors);
      if (
        (dispatch.allowedTools || []).some(
          (toolId) => !action.tools.includes(toolId),
        )
      )
        errors.push(`Action ${action.id} 不允许请求指定 Tool`);
    }
    const key = `${dispatch.participantId}:${dispatch.actionId}`;
    if (seen.has(key)) errors.push(`重复 dispatch ${key}`);
    seen.add(key);
  }
  return errors;
}

export function createActorActionJobRequest(
  {
    personaPrompt,
    userMaskPrompt,
    history,
    participantId,
    action,
    context,
    allowedTools = [],
  },
  requestOptions,
) {
  const instruction = [
    personaPrompt,
    userMaskPrompt,
    `你正在执行 Action ${action.id}（${action.name}），不是自由聊天。`,
    action.description,
    `Action Context：\n${JSON.stringify(context, null, 2)}`,
    `允许的 Tools：\n${JSON.stringify(allowedTools)}`,
    `相关历史：\n${JSON.stringify(history, null, 2)}`,
    `直接在最终回复中输出 JSON 信封（不要在分析过程中构造），字段必须与示例完全一致：{"participantId":"${participantId}","actionId":"${action.id}","status":"completed","response":"角色对用户说的话","result":{...}}。`,
    `字段规则：response 必须填写，面向最终用户，只能放自然语言（角色要说的话），不允许 JSON 或状态字段；result 仅保存机器可读的结构化数据（状态/计数/进度等），不作为聊天内容展示。`,
    `严格约束：participantId 必须是上面的实例 ID（形如 participant-xxxx，绝不是角色名或人名）；actionId 必须是 "${action.id}"；status 只能是 completed / blocked / abstain 之一（不要用 success）；result 必须是对象（符合 Action ${action.id} 的 outputSchema 结构）。不要输出解释文字或 Markdown。`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const envelopeValidator = createSchemaValidator({
    type: "object",
    required: ["participantId", "actionId", "status", "result"],
    properties: {
      participantId: { type: "string", enum: [participantId] },
      actionId: { type: "string", enum: [action.id] },
      status: { type: "string", enum: ["completed", "blocked", "abstain"] },
      result: { type: ["object", "null"] },
      needs: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "reason"],
          properties: { name: { type: "string" }, reason: { type: "string" } },
          additionalProperties: false,
        },
      },
      reason: { type: "string" },
      response: { type: "string" },
    },
    additionalProperties: false,
  });
  const outputValidator = createSchemaValidator(action.outputSchema);
  const validator = (text) => {
    const envelope = envelopeValidator(text);
    if (!envelope.ok) return envelope;
    // 协议校验:respond 类行动 completed 时必须提供 response(用户可见通道),
    // 否则视为协议错误——模型把"对话内容"塞进 result 是协议漂移,应在此拦截。
    if (envelope.value.status === "completed" && !String(envelope.value.response || "").trim()) {
      return {
        ok: false,
        errors: [`Action ${action.id} completed 时必须提供 response 字段(角色要说的话),不允许把对话内容放在 result 里`],
      };
    }
    if (envelope.value.status === "completed") {
      const output = outputValidator(JSON.stringify(envelope.value.result));
      // result 结构不符 outputSchema 时仅降级为警告,不拒绝——聊天展示场景模型输出更丰富,
      // 严格拒绝会让整个 actor 行动失败;调度字段(participantId/actionId/status)仍严格校验。
      if (!output.ok) return { ...envelope, outputWarnings: output.errors };
    }
    return envelope;
  };
  return new JobRequest({
    ...jobOptions(requestOptions),
    messages: [{ role: "user", content: instruction }],
    validator,
    retrier: createRetrier(2),
  });
}
