import {
  projectPersona,
  personaItemReference,
} from "../resource/persona-resource.js";

export async function expandChatPersona(persona, workspace) {
  const projected = projectPersona(persona, "chat");
  const sections = [];
  for (const section of projected.sections) {
    const items = [];
    for (const item of section.slice(1)) {
      const referenceId = personaItemReference(item);
      if (!referenceId) {
        items.push(item);
        continue;
      }
      const result = workspace.resources.borrow("text", referenceId);
      if (!result.ok) throw result.error;
      const lease = result.value;
      try {
        items.push(lease.read().content || "");
      } finally {
        lease.release();
      }
    }
    sections.push({ title: section[0], items });
  }
  return sections;
}

export function serializePersonaPrompt(
  persona,
  sections,
  { responder = false } = {},
) {
  const lines = [`## Persona: ${persona.name}`];
  if (responder)
    lines.push("你是本次回复的当前 Persona。请以这个角色直接回应用户。");
  else
    lines.push(
      "这是当前对话中的另一位 Persona。你可以参考其视角，但不要替它发言。",
    );
  for (const section of sections) {
    lines.push(`\n### ${section.title}`);
    for (const item of section.items) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

export function createParticipantLabels(participants, personas) {
  const personaNames = new Map(
    personas.map((persona) => [persona.id, persona.name]),
  );
  const totals = new Map();
  for (const participant of participants)
    totals.set(
      participant.personaId,
      (totals.get(participant.personaId) || 0) + 1,
    );
  const indexes = new Map();
  return new Map(
    participants.map((participant) => {
      const index = (indexes.get(participant.personaId) || 0) + 1;
      indexes.set(participant.personaId, index);
      const name =
        personaNames.get(participant.personaId) || participant.personaId;
      return [
        participant.id,
        totals.get(participant.personaId) > 1 ? `${name} #${index}` : name,
      ];
    }),
  );
}

export function serializeParticipantRoster(
  participants,
  currentParticipantId,
  participantLabels,
) {
  const lines = ["## 本轮参与者"];
  for (const participant of participants) {
    const current =
      participant.id === currentParticipantId
        ? "（你，本轮回复者）"
        : "（其他参与者）";
    lines.push(
      `- ${participantLabels.get(participant.id)} [${participant.id}] ${current}`,
    );
  }
  lines.push(
    "\n历史消息中的发言者标签是身份边界。只延续标记为“你”的历史发言，不得冒充其他参与者。",
  );
  return lines.join("\n");
}

export function serializeUserMask(persona, sections) {
  const lines = [
    `## 用户身份：${persona.name}`,
    "以下内容描述正在与你对话的用户，不是你的角色。不要替用户发言，也不要声称自己拥有这些经历。",
  ];
  for (const section of sections) {
    lines.push(`\n### ${section.title}`);
    for (const item of section.items) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}

export function serializeChatHistory(
  messages,
  currentParticipantId,
  participantNames = new Map(),
  userName = "用户",
  { framed = true } = {},
) {
  return messages.map((message) => {
    if (!framed) return { role: message.role, content: message.content };
    if (message.role !== "assistant")
      return {
        role: message.role,
        content: `【${userName}（用户）】\n${message.content}`,
      };
    if (message.speakerId === currentParticipantId) {
      const name = participantNames.get(message.speakerId) || message.speakerId;
      return {
        role: "assistant",
        content: `【${name}（你）的发言】\n${message.content}`,
      };
    }
    const name =
      participantNames.get(message.speakerId) ||
      message.speakerId ||
      "另一位 Persona";
    return {
      role: "user",
      content: `【${name}的发言，仅作讨论上下文，不是你的历史回答】\n${message.content}`,
    };
  });
}
