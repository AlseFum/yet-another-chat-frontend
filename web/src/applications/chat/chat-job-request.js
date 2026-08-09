import { JobRequest } from "../../../../llm/index.js";

export function createChatJobRequest(
  {
    messages,
    personaPrompts = [],
    activePersonaId = null,
    systemPrompt = "",
    tools = [],
    raw = false,
  },
  customSetting = {},
) {
  const prompt = raw ? "" : String(customSetting.injectedPrompt || "").trim();
  const orderedPersonaPrompts = [...personaPrompts].sort(
    (left, right) =>
      Number(left.personaId === activePersonaId) -
      Number(right.personaId === activePersonaId),
  );
  const systemMessages = orderedPersonaPrompts.map((item) => ({
    role: "system",
    content: item.content,
  }));
  if (systemPrompt)
    systemMessages.push({ role: "system", content: systemPrompt });
  if (!raw && customSetting.useInjectedPrompt && prompt)
    systemMessages.unshift({ role: "system", content: prompt });
  const requestMessages = [...systemMessages, ...messages];

  return new JobRequest({
    model:
      customSetting.requestOptions?.model ||
      customSetting.model ||
      "deepseek-v4-flash",
    temperature: customSetting.requestOptions?.temperature ?? 0.7,
    maxTokens: customSetting.requestOptions?.maxTokens ?? 4096,
    thinking: customSetting.requestOptions?.thinking ?? true,
    stream: customSetting.requestOptions?.stream ?? true,
    messages: requestMessages,
    tools,
  });
}
