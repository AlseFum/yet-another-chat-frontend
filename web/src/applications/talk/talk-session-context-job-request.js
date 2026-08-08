import {
  createRetrier,
  createSchemaValidator,
  JobRequest,
} from "../../../../llm/index.js";
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["sessionContext"],
  properties: {
    sessionContext: { type: "string", minLength: 1, maxLength: 8000 },
  },
};
export function createTalkSessionContextJobRequest(
  { persona, worldContext, guidance, requestOptions },
  customSetting = {},
) {
  const values = { persona, worldContext, guidance };
  const template = String(
    customSetting.sessionContextPrompt ||
      "根据 Persona、世界背景和用户说明，生成本 Session 的关系、情境和边界描述。",
  ).replace(
    /\{\{(persona|worldContext|guidance)\}\}/g,
    (_, key) => values[key],
  );
  const instruction = String(
    customSetting.sessionContextInstruction ||
      "根据 Persona、世界背景和用户说明，生成本 Session 的关系、情境和边界描述。",
  );
  return new JobRequest({
    ...requestOptions,
    messages: [
      {
        role: "system",
        content: `${instruction}\n\n${template}\n只返回 {"sessionContext":"..."}。`,
      },
      { role: "user", content: JSON.stringify(values) },
    ],
    validator: createSchemaValidator(schema),
    retrier: createRetrier(2),
  });
}
