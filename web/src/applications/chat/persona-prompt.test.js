import assert from "node:assert/strict";
import {
  serializeChatHistory,
  serializeParticipantOutlooks,
  serializeParticipantRoster,
  createParticipantLabels,
  serializePersonaPrompt,
} from "./persona-prompt.js";

const messages = [
  { role: "user", content: "你好" },
  { role: "assistant", content: "你好，我是角色" },
];
assert.deepEqual(
  serializeChatHistory(messages, "p-1", new Map(), "用户", { framed: false }),
  messages,
);

const outlook = serializeParticipantOutlooks(
  [
    { participantId: "p-1", name: "甲", items: ["戴着红围巾"] },
    { participantId: "p-2", name: "乙", items: ["说话很快"] },
  ],
  "p-1",
);
assert.doesNotMatch(outlook, /甲/);
assert.match(outlook, /乙/);
assert.equal(
  serializeParticipantOutlooks(
    [{ participantId: "p-1", name: "甲", items: [] }],
    "p-1",
  ),
  "",
);
const roster = serializeParticipantRoster(
  [{ id: "internal-id", personaId: "p-1" }],
  "internal-id",
  new Map([["internal-id", "甲"]]),
);
assert.match(roster, /甲/);
assert.doesNotMatch(roster, /internal-id/);
assert.equal(
  createParticipantLabels(
    [{ id: "p-1", personaId: "child" }],
    [{ id: "child", name: "小孩" }],
    new Set(["小孩"]),
  ).get("p-1"),
  "小孩（角色）",
);
assert.match(
  serializePersonaPrompt({ name: "小孩" }, [], {
    responder: true,
    displayName: "小孩（角色）",
  }),
  /Persona: 小孩（角色）/,
);
console.log("persona prompt tests passed");
