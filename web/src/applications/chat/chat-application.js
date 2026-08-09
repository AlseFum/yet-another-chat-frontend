import { createChatJobRequest } from "./chat-job-request.js";
import {
  createActorActionJobRequest,
  createOrchestratorJobRequest,
  validateOrchestratorDecision,
  validateOrchestratorParticipants,
} from "./orchestrator-job-request.js";
import {
  createParticipantLabels,
  expandChatPersona,
  expandPersonaOutlook,
  serializeChatHistory,
  serializeParticipantRoster,
  serializeParticipantOutlooks,
  serializePersonaPrompt,
  serializeUserMask,
} from "./persona-prompt.js";
import { isRecord, matchTag } from "../../../../util/match.js";
import { expandTextReferences } from "../../workspace/text-reference.js";

export class ChatApplication {
  static schema() {
    return {
      useInjectedPrompt: {
        type: "boolean",
        label: "使用注入 Prompt",
        default: false,
      },
      injectedPrompt: { type: "textarea", label: "注入 Prompt", default: "" },
      maxToolCalls: {
        type: "number",
        label: "原始模式最大 Tool 调用次数",
        description: "单次原始模式对话允许执行的 Tool 总次数。",
        default: 30,
        min: 1,
        max: 30,
        step: 1,
      },
      model: {
        type: "text",
        label: "默认模型",
        description: "新建 Chat 时使用的模型名称。",
        default: "deepseek-v4-flash",
      },
      temperature: {
        type: "number",
        label: "默认 Temperature",
        description: "新建 Chat 时的默认随机性。",
        default: 0.7,
        min: 0,
        max: 2,
        step: 0.1,
      },
      maxTokens: {
        type: "number",
        label: "默认 Max tokens",
        description: "新建 Chat 时的默认最大输出长度。",
        default: 4096,
        min: 1,
        step: 1,
      },
      thinking: { type: "boolean", label: "默认启用思维过程", default: true },
      stream: { type: "boolean", label: "默认流式输出", default: true },
    };
  }

  constructor() {
    this.id = "chat";
    this.stateKey = "chat";
    this.workspace = null;
    this.conversations = [];
    this.ui = { activeConversationId: null };
    this.jobSubscriptions = new Map();
    this.jobPollers = new Map();
  }

  get personas() {
    return this.workspace?.resources?.list("persona") || [];
  }

  async expandReferences(messages) {
    return Promise.all(
      messages.map(async (message) => ({
        ...message,
        content: await expandTextReferences(message.content, this.workspace),
      })),
    );
  }

  revive(workspace) {
    this.workspace = workspace;
    const state = workspace.state.get(this.stateKey, {});
    this.conversations = Array.isArray(state.conversations)
      ? state.conversations
      : [];
    this.ui = { activeConversationId: null, ...state.ui };
    this.rebindJobs();
    this.rebindRuns();
  }

  rebindRuns() {
    for (const conversation of this.conversations) {
      for (const run of conversation.runs || []) {
        if (["completed", "failed", "cancelled"].includes(run.status)) continue;
        for (const dispatch of run.dispatches || []) {
          if (!dispatch.jobId) continue;
          const message = conversation.messages.find(
            (item) => item.id === dispatch.messageId,
          );
          const job = this.workspace.jobsManager.get(dispatch.jobId);
          if (!message || !job) continue;
          message.jobId = dispatch.jobId;
          this.applyJobSnapshot(message, job);
          dispatch.status = job.status;
        }
        const terminal =
          (run.dispatches || []).length &&
          run.dispatches.every((dispatch) =>
            ["completed", "failed", "cancelled", "blocked", "abstain"].includes(
              dispatch.status,
            ),
          );
        if (terminal)
          run.status = run.dispatches.some(
            (dispatch) => dispatch.status === "failed",
          )
            ? "failed"
            : "completed";
      }
    }
  }

  rebindJobs() {
    const activeJobs = new Set();
    for (const conversation of this.conversations) {
      for (const message of conversation.messages || []) {
        if (!message.jobId) continue;
        const job = this.workspace.jobsManager.get(message.jobId);
        if (!job) continue;
        this.applyJobSnapshot(message, job);
        if (!message.streaming) continue;
        activeJobs.add(message.jobId);
        if (!this.jobSubscriptions.has(message.jobId)) {
          this.jobSubscriptions.set(
            message.jobId,
            job.onEvent((event) => this.applyJobEvent(message, event)),
          );
        }
      }
    }
    for (const [jobId, subscription] of this.jobSubscriptions) {
      if (!activeJobs.has(jobId)) {
        subscription.unsubscribe();
        this.jobSubscriptions.delete(jobId);
      }
    }
  }

  applyJobSnapshot(message, job) {
    if ((job.responseText || "").length >= (message.content || "").length)
      message.content = job.responseText || message.content || "";
    if ((job.reasoning || "").length >= (message.reasoning || "").length)
      message.reasoning = job.reasoning || message.reasoning || "";
    if (["completed", "failed", "cancelled", "missing"].includes(job.status)) {
      message.streaming = false;
      if (job.status !== "completed" && !message.content)
        message.content =
          job.status === "cancelled" ? "Job 已取消。" : "Job 执行失败。";
    }
  }

  applyJobEvent(message, event) {
    const finish = (state) => {
      message.streaming = false;
      if (state !== "completed" && !message.content)
        message.content =
          state === "cancelled" ? "Job 已取消。" : "Job 执行失败。";
      void this.save();
      this.jobSubscriptions.get(message.jobId)?.unsubscribe();
      this.jobSubscriptions.delete(message.jobId);
      this.stopJobPoller(message.jobId);
    };
    const stateCases = { completed: finish, failed: finish, cancelled: finish };
    const eventCases = {
      delta: (value) => {
        message.content =
          value.responseText ?? `${message.content}${value.content || ""}`;
        message.reasoning =
          value.responseReasoning ??
          `${message.reasoning}${value.reasoning || ""}`;
      },
      result: (value) => {
        if (value.rawText && !message.content) message.content = value.rawText;
      },
      state: (value) =>
        matchTag(value.state, stateCases, () => {})(value.state),
    };
    matchTag(event.type, eventCases, () => {})(event);
  }

  startJobPoller(message, job) {
    if (
      this.workspace.jobsManager.source(job.id) === "direct" ||
      this.jobPollers.has(job.id)
    )
      return;
    const poll = async () => {
      if (!message.streaming) return this.stopJobPoller(job.id);
      try {
        const response = await this.workspace.transport.loadJobs([job.id], {
          detail: true,
        });
        const snapshot = response.jobs?.[0];
        if (snapshot) {
          Object.assign(job, snapshot);
          this.applyJobSnapshot(message, job);
          if (!message.streaming) {
            void this.save();
            return this.stopJobPoller(job.id);
          }
        }
      } catch {}
      if (message.streaming) this.jobPollers.set(job.id, setTimeout(poll, 350));
    };
    this.jobPollers.set(job.id, setTimeout(poll, 350));
  }

  stopJobPoller(jobId) {
    const timer = this.jobPollers.get(jobId);
    if (timer) clearTimeout(timer);
    this.jobPollers.delete(jobId);
  }

  init() {
    if (
      !this.conversations.some(
        (item) => item.id === this.ui.activeConversationId,
      )
    ) {
      this.ui.activeConversationId = this.conversations[0]?.id || null;
    }
  }

  get activeConversation() {
    return (
      this.conversations.find(
        (item) => item.id === this.ui.activeConversationId,
      ) || null
    );
  }

  sync() {
    this.workspace.state.set(this.stateKey, {
      conversations: this.conversations,
      ui: { ...this.ui },
    });
  }

  save() {
    this.sync();
    return this.workspace.saveState();
  }

  select(conversationId) {
    if (!this.conversations.some((item) => item.id === conversationId)) return;
    this.ui.activeConversationId = conversationId;
    return this.save();
  }

  create(config = {}) {
    const firstPersona = this.personas[0]?.id || null;
    const mode = ["raw", "single", "multi"].includes(config.mode)
      ? config.mode
      : "raw";
    const selectedPersonaIds = Array.isArray(config.personaIds)
      ? config.personaIds
      : [];
    const configuredParticipants = Array.isArray(config.participants)
      ? config.participants
      : [];
    const participants =
      mode === "single"
        ? [
            {
              id: `participant-${Date.now()}`,
              personaId: config.personaId || firstPersona,
              alias: "",
              api: { keyRefId: config.api.keyRefId },
            },
          ]
        : mode === "multi"
          ? configuredParticipants.map((participant) => ({
              ...participant,
              alias: String(participant.alias || "").trim(),
            }))
          : [];
    const defaults = this.workspace?.getCustomSettings(this.id) || {};
    const conversation = {
      id: `chat-${Date.now()}`,
      name: config.name,
      mode,
      policy: config.policy,
      systemPrompt: config.systemPrompt,
      userMask: config.userMask,
      personaId: mode === "single" ? participants[0]?.personaId : null,
      personaIds: mode === "multi" ? selectedPersonaIds : [],
      participants,
      activePersonaId: participants[0]?.id || null,
      api: config.api,
      orchestrator: config.orchestrator,
      toolIds:
        mode === "raw" && Array.isArray(config.toolIds) ? config.toolIds : [],
      requestOptions: config.requestOptions,
      runs: [],
      messages: [],
    };
    this.conversations.push(conversation);
    this.ui.activeConversationId = conversation.id;
    return conversation;
  }

  async updateConversationSettings(patch) {
    const conversation = this.activeConversation;
    if (!conversation || !patch || typeof patch !== "object") return;
    const next = { ...conversation, ...patch };
    Object.assign(conversation, next);
    return this.save();
  }

  async renameConversation(conversationId, name) {
    const conversation = this.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation) return;
    const nextName = String(name || "").trim();
    if (!nextName || nextName === conversation.name) return;
    conversation.name = nextName;
    return this.save();
  }

  async setConversationPersona(personaId) {
    const persona = this.personas.find((item) => item.id === personaId);
    if (!persona) throw new Error("找不到 Persona Resource");
    const current = this.activeConversation?.participants?.[0];
    return this.updateConversationSettings({
      mode: "single",
      personaId,
      personaIds: [personaId],
      participants: [
        {
          id: current?.id || `participant-${Date.now()}`,
          personaId,
          api: {
            keyRefId:
              current?.api?.keyRefId ||
              this.activeConversation.api?.keyRefId ||
              null,
          },
        },
      ],
      activePersonaId: current?.id || null,
      orchestrator: null,
    });
  }

  async setActivePersona(personaId) {
    const conversation = this.activeConversation;
    const participant = conversation?.participants?.find(
      (item) => item.id === personaId || item.personaId === personaId,
    );
    if (!participant) throw new Error("当前 Persona 实例不在对话参与者列表中");
    return this.updateConversationSettings({ activePersonaId: participant.id });
  }

  async removeParticipant(participantId) {
    const conversation = this.activeConversation;
    const participants = (conversation?.participants || []).filter(
      (participant) => participant.id !== participantId,
    );
    if (!participants.length) throw new Error("至少需要保留一个 Persona 实例");
    const activePersonaId = participants.some(
      (participant) => participant.id === conversation.activePersonaId,
    )
      ? conversation.activePersonaId
      : participants[0].id;
    return this.updateConversationSettings({
      mode: "multi",
      personaId: null,
      participants,
      personaIds: [
        ...new Set(participants.map((participant) => participant.personaId)),
      ],
      activePersonaId,
    });
  }

  async remove(conversationId) {
    const index = this.conversations.findIndex(
      (item) => item.id === conversationId,
    );
    if (index < 0) return;
    const conversation = this.conversations[index];
    for (const message of conversation.messages || []) {
      if (message.jobId && message.streaming)
        await this.workspace.abortJob(message.jobId);
    }
    this.conversations.splice(index, 1);
    if (this.ui.activeConversationId === conversationId) {
      this.ui.activeConversationId =
        this.conversations[index]?.id ||
        this.conversations[index - 1]?.id ||
        this.conversations[0]?.id ||
        null;
    }
    return this.save();
  }

  rawToolDefinitions(current) {
    return (current.toolIds || [])
      .map((id) => this.workspace.resources.get("tool", id))
      .filter(Boolean)
      .map((tool) => {
        let parameters = { type: "object", properties: {} };
        try {
          parameters = tool.args ? JSON.parse(tool.args) : parameters;
        } catch {
          parameters = { type: "object", properties: {} };
        }
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description || tool.name,
            parameters,
          },
          resource: tool,
        };
      });
  }

  async executeRawTool(tool, args, current) {
    const logger = { log: () => {} };
    const execute = new Function(
      "ctx",
      `"use strict"; return (async () => { ${tool.content || ""}\n})()`,
    );
    return execute({
      args,
      fetch: globalThis.fetch,
      signal: null,
      workspace: this.workspace,
      resources: this.workspace.resources,
      logger,
      job: { conversationId: current.id },
    });
  }

  runRawJob(request, keyRef, assistant) {
    return new Promise((resolve, reject) => {
      let job;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      const onEvent = (event) => {
        if (event.type === "delta") {
          assistant.content =
            event.responseText ?? `${assistant.content}${event.content || ""}`;
          assistant.reasoning =
            event.responseReasoning ??
            `${assistant.reasoning || ""}${event.reasoning || ""}`;
          void this.save();
        }
        if (event.type === "result")
          finish(resolve, {
            job,
            rawText: event.rawText || job?.responseText || "",
            toolCalls: event.toolCalls || job?.toolCalls || [],
          });
        if (
          event.type === "state" &&
          ["failed", "cancelled"].includes(event.state)
        )
          finish(reject, new Error(`Job ${event.state}`));
      };
      this.workspace
        .createJob({
          request,
          keyRef,
          metadata: {
            source: "chat:raw",
            conversationId: assistant.conversationId,
          },
          onEvent,
          onCreated: async (created) => {
            job = created;
            assistant.jobId = created.id;
            this.startJobPoller(assistant, created);
            await this.save();
          },
        })
        .then((created) => {
          job = created;
          if (created.status === "completed")
            finish(resolve, {
              job,
              rawText: created.responseText || "",
              toolCalls: created.toolCalls || [],
            });
        })
        .catch((error) => finish(reject, error));
    });
  }

  async runRawChat(current, assistant, messages, systemPrompt, keyRef) {
    const definitions = this.rawToolDefinitions(current);
    const tools = definitions.map(({ resource, ...definition }) => definition);
    const toolMap = new Map(
      definitions.map((definition) => [
        definition.function.name,
        definition.resource,
      ]),
    );
    const settings = this.workspace.getCustomSettings(this.id);
    const maxToolCalls = Math.max(
      1,
      Math.min(30, Number(settings.maxToolCalls) || 30),
    );
    const requestMessages = [...messages];
    let toolCallCount = 0;
    try {
      while (true) {
        // A tool round creates a new provider request, while the Conversation
        // keeps the assistant's persisted link for recovery and UI updates.
        assistant.content = "";
        const request = createChatJobRequest(
          { messages: requestMessages, systemPrompt, raw: true, tools },
          { requestOptions: current.requestOptions },
        );
        const result = await this.runRawJob(request, keyRef, assistant);
        if (!result.toolCalls.length) {
          assistant.streaming = false;
          await this.save();
          return result.job;
        }
        const assistantMessage = {
          role: "assistant",
          content: result.rawText || null,
          tool_calls: result.toolCalls,
        };
        requestMessages.push(assistantMessage);
        for (const call of result.toolCalls) {
          if (++toolCallCount > maxToolCalls)
            throw new Error(`Tool 调用次数超过上限 ${maxToolCalls}`);
          const tool = toolMap.get(call.function?.name);
          if (!tool)
            throw new Error(
              `模型请求了未授权 Tool：${call.function?.name || "未知"}`,
            );
          let args;
          try {
            args = JSON.parse(call.function?.arguments || "{}");
          } catch {
            throw new Error(`Tool ${tool.name} 参数不是有效 JSON`);
          }
          const value = await this.executeRawTool(tool, args, current);
          requestMessages.push({
            role: "tool",
            tool_call_id: call.id,
            name: tool.name,
            content: JSON.stringify(value ?? null),
          });
        }
      }
    } catch (error) {
      assistant.streaming = false;
      assistant.content = `Tool 执行失败：${error.message}`;
      await this.save();
      throw error;
    }
  }

  async sendMessage(content) {
    const current = this.activeConversation;
    if (!current) throw new Error("请先创建或选择对话");
    const activeParticipant =
      current.participants?.find(
        (participant) => participant.id === current.activePersonaId,
      ) || current.participants?.[0];
    const keyRefId = activeParticipant?.api?.keyRefId || current.api?.keyRefId;
    const keyRef = keyRefId ? this.workspace.keyRefFor?.(keyRefId) : null;
    if (!keyRef) throw new Error("请先在设置或 API Key 页面选择凭据");
    if (current.mode === "raw") {
      const messageId = `message-${Date.now()}`;
      current.messages.push(
        { id: messageId, role: "user", content },
        {
          id: `${messageId}-assistant`,
          role: "assistant",
          content: "",
          reasoning: "",
          streaming: true,
        },
      );
      const assistant = current.messages.find(
        (message) => message.id === `${messageId}-assistant`,
      );
      assistant.conversationId = current.id;
      await this.save();
      const messages = await this.expandReferences(
        current.messages
          .filter((message) => !message.streaming)
          .map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
      );
      const systemPrompt = await expandTextReferences(
        current.systemPrompt,
        this.workspace,
      );
      return this.runRawChat(
        current,
        assistant,
        messages,
        systemPrompt,
        keyRef,
      );
    }
    const participants =
      current.mode === "multi"
        ? current.participants
        : current.mode === "single"
          ? current.participants.slice(0, 1)
          : [];
    if (
      !participants.length ||
      participants.some((participant) => !participant.personaId)
    )
      throw new Error("请先为每个实例选择 Persona");
    const personas = participants
      .map((participant) => ({
        participant,
        persona: this.personas.find(
          (persona) => persona.id === participant.personaId,
        ),
      }))
      .filter((item) => item.persona);
    if (personas.length !== participants.length)
      throw new Error("对话引用了不存在的 Persona Resource");
    if (current.mode === "multi" && current.policy === "orchestrated") {
      const contractErrors = validateOrchestratorParticipants(personas);
      if (contractErrors.length) throw new Error(contractErrors.join("；"));
    }
    const userMaskName =
      current.mode === "multi"
        ? this.personas.find(
            (persona) => persona.id === current.userMask?.personaId,
          )?.name
        : null;
    const participantNames = createParticipantLabels(
      participants,
      this.personas,
      userMaskName ? new Set([userMaskName]) : new Set(),
    );
    const personaPrompts = new Map();
    for (const { participant, persona } of personas) {
      const sections = await expandChatPersona(persona, this.workspace);
      personaPrompts.set(
        participant.id,
        serializePersonaPrompt(persona, sections, {
          responder: true,
          displayName: participantNames.get(participant.id) || persona.name,
        }),
      );
    }
    const userMessage = { id: `message-${Date.now()}`, role: "user", content };
    current.messages.push(userMessage);
    await this.save();

    const participantOutlooks =
      current.mode === "multi"
        ? await Promise.all(
            personas.map(async ({ participant, persona }) => ({
              participantId: participant.id,
              name: participantNames.get(participant.id) || persona.name,
              items: (
                await expandPersonaOutlook(persona, this.workspace)
              ).flatMap((section) => section.items),
            })),
          )
        : [];
    let userName = "用户";
    let userMaskPrompt = "";
    if (current.mode === "multi") {
      const userMaskPersona = this.personas.find(
        (persona) => persona.id === current.userMask?.personaId,
      );
      if (!userMaskPersona)
        throw new Error("找不到 User Mask 引用的 Persona Resource");
      const userMaskSections = await expandChatPersona(
        userMaskPersona,
        this.workspace,
      );
      userMaskPrompt = serializeUserMask(userMaskPersona, userMaskSections);
      userName = userMaskPersona.name;
    }
    if (current.mode === "multi" && current.policy === "orchestrated")
      return this.runOrchestrator(
        current,
        content,
        personas,
        participantNames,
        userMaskPrompt,
        userName,
      );
    const draftIds = new Map(
      participants.map((participant) => [
        participant.id,
        `message-${Date.now()}-${participant.id}`,
      ]),
    );
    current.messages.push(
      ...participants.map((participant) => ({
        id: draftIds.get(participant.id),
        role: "assistant",
        speakerId: participant.id,
        personaId: participant.personaId,
        content: "",
        reasoning: "",
        streaming: true,
      })),
    );
    await this.save();
    const jobs = participants.map(async (participant) => {
      // Read the item back from the reactive array. Mutating the original object
      // passed to push() does not notify ChatView.
      const assistant = current.messages.find(
        (message) => message.id === draftIds.get(participant.id),
      );
      const participantKeyId = participant.api?.keyRefId;
      const participantKey = participantKeyId
        ? this.workspace.keyRefFor?.(participantKeyId)
        : null;
      if (!participantKey)
        throw new Error(`Persona 实例 ${participant.id} 没有可用 API Key`);
      const history = await this.expandReferences(
        serializeChatHistory(
          current.messages.filter((message) => !message.streaming),
          participant.id,
          participantNames,
          userName,
          { framed: current.mode === "multi" },
        ),
      );
      const rosterPrompt =
        current.mode === "multi"
          ? serializeParticipantRoster(
              participants,
              participant.id,
              participantNames,
            )
          : "";
      const systemPrompt = await expandTextReferences(
        [
          current.systemPrompt,
          userMaskPrompt,
          rosterPrompt,
          current.mode === "multi"
            ? serializeParticipantOutlooks(participantOutlooks, participant.id)
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        this.workspace,
      );
      const request = createChatJobRequest(
        {
          messages: history,
          personaPrompts: [
            {
              personaId: participant.id,
              content: personaPrompts.get(participant.id),
            },
          ],
          activePersonaId: participant.id,
          systemPrompt,
        },
        {
          ...this.workspace.getCustomSettings(this.id),
          requestOptions: current.requestOptions,
        },
      );
      return this.createChatJob(
        current,
        assistant,
        request,
        participantKey,
        participant.id,
      );
    });
    try {
      const results = await Promise.all(jobs);
      await this.save();
      return results;
    } catch (error) {
      await this.save();
      throw error;
    }
  }

  async runOrchestrator(
    current,
    content,
    personas,
    participantNames,
    userMaskPrompt,
    userName,
  ) {
    const run = {
      id: `run-${Date.now()}`,
      status: "planning",
      createdAt: new Date().toISOString(),
      orchestratorJobId: null,
      decision: null,
      dispatches: [],
      results: [],
      error: null,
    };
    current.runs.push(run);
    current.messages.push({
      id: `${run.id}-event`,
      role: "orchestrator",
      runId: run.id,
      status: "planning",
      content: "正在为各个角色整理行动 Context…",
    });
    await this.save();
    try {
      const keyRef = this.workspace.keyRefFor(
        current.orchestrator.api.keyRefId,
      );
      if (!keyRef) throw new Error("Orchestrator 没有可用 API");
      const history = await this.expandReferences(
        serializeChatHistory(
          current.messages.filter(
            (message) =>
              ["user", "assistant"].includes(message.role) &&
              !message.streaming,
          ),
          "",
          participantNames,
          userName,
        ),
      );
      const systemPrompt = await expandTextReferences(
        current.systemPrompt,
        this.workspace,
      );
      const latestUserMessage = await expandTextReferences(
        content,
        this.workspace,
      );
      const prompt = await expandTextReferences(
        current.orchestrator.prompt,
        this.workspace,
      );
      const request = createOrchestratorJobRequest(
        {
          systemPrompt,
          userMaskPrompt,
          history,
          participants: personas,
          latestUserMessage,
          prompt,
        },
        current.requestOptions,
      );
      const { job, value } = await this.executeStructuredJob(
        request,
        keyRef,
        {
          source: `orchestrator:${current.name}`,
          conversationId: current.id,
          runId: run.id,
          kind: "orchestrator",
        },
        (created) => {
          run.orchestratorJobId = created.id;
          void this.save();
        },
      );
      const errors = validateOrchestratorDecision(value, personas);
      if (errors.length) throw new Error(errors.join("；"));
      if (value.dispatches.length > current.orchestrator.maxDispatches)
        throw new Error(
          `Orchestrator Dispatch 超过上限 ${current.orchestrator.maxDispatches}`,
        );
      run.decision = value;
      const event = current.messages.find(
        (message) =>
          message.runId === run.id && message.role === "orchestrator",
      );
      event.status = value.status;
      event.content = value.reason;
      if (value.status !== "dispatch") {
        run.status = value.status === "finish" ? "completed" : "waiting";
        await this.save();
        return run;
      }
      run.status = "dispatching";
      await this.save();
      const actorJobs = value.dispatches.map((dispatch) =>
        this.runActorAction(
          current,
          run,
          dispatch,
          personas,
          participantNames,
          userMaskPrompt,
          userName,
        ),
      );
      const settled = await Promise.allSettled(actorJobs);
      run.status = settled.some((result) => result.status === "rejected")
        ? "failed"
        : "completed";
      run.error =
        settled
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason.message)
          .join("；") || null;
      event.status = run.status;
      await this.save();
      return run;
    } catch (error) {
      run.status = "failed";
      run.error = error.message;
      const event = current.messages.find(
        (message) =>
          message.runId === run.id && message.role === "orchestrator",
      );
      event.status = "failed";
      event.content = error.message;
      await this.save();
      throw error;
    }
  }

  async runActorAction(
    current,
    run,
    dispatch,
    personas,
    participantNames,
    userMaskPrompt,
    userName,
  ) {
    const actor = personas.find(
      (item) => item.participant.id === dispatch.participantId,
    );
    const action = actor.persona.orchestrator.actions.find(
      (item) => item.id === dispatch.actionId,
    );
    const sections = await expandChatPersona(actor.persona, this.workspace);
    const personaPrompt = serializePersonaPrompt(actor.persona, sections, {
      responder: true,
      displayName:
        participantNames.get(actor.participant.id) || actor.persona.name,
    });
    const history = serializeChatHistory(
      current.messages.filter(
        (message) =>
          ["user", "assistant"].includes(message.role) && !message.streaming,
      ),
      actor.participant.id,
      participantNames,
      userName,
    );
    const message = {
      id: `${run.id}-${actor.participant.id}-${action.id}`,
      role: "assistant",
      kind: "action",
      runId: run.id,
      speakerId: actor.participant.id,
      personaId: actor.persona.id,
      actionId: action.id,
      content: "",
      reasoning: "",
      streaming: true,
      actionResult: null,
    };
    current.messages.push(message);
    const assistant = current.messages.find((item) => item.id === message.id);
    const request = createActorActionJobRequest(
      {
        personaPrompt,
        userMaskPrompt,
        history,
        participantId: actor.participant.id,
        action,
        context: dispatch.context,
        allowedTools: dispatch.allowedTools,
      },
      current.requestOptions,
    );
    const keyRef = this.workspace.keyRefFor(actor.participant.api.keyRefId);
    if (!keyRef)
      throw new Error(`Persona 实例 ${actor.participant.id} 没有可用 API`);
    const entry = {
      participantId: actor.participant.id,
      actionId: action.id,
      jobId: null,
      messageId: message.id,
      status: "running",
    };
    run.dispatches.push(entry);
    try {
      const { job, value } = await this.executeStructuredJob(
        request,
        keyRef,
        {
          source: `actor:${current.name}`,
          conversationId: current.id,
          runId: run.id,
          participantId: actor.participant.id,
          actionId: action.id,
          kind: "actor",
        },
        (created) => {
          entry.jobId = created.id;
          assistant.jobId = created.id;
          void this.save();
        },
      );
      entry.status = value.status;
      assistant.jobId = job.id;
      assistant.streaming = false;
      assistant.actionResult = value;
      assistant.content =
        value.response ||
        (value.result
          ? JSON.stringify(value.result, null, 2)
          : value.reason || "");
      run.results.push(value);
      return value;
    } catch (error) {
      entry.status = "failed";
      assistant.streaming = false;
      assistant.content = `Action 执行失败：${error.message}`;
      throw error;
    }
  }

  async executeStructuredJob(request, keyRef, metadata, onCreated = null) {
    let resolveResult;
    let rejectResult;
    const completed = new Promise((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const stateCases = {
      failed: (state) => rejectResult(new Error(`Job ${state}`)),
      cancelled: (state) => rejectResult(new Error(`Job ${state}`)),
    };
    const eventCases = {
      result: (event) =>
        resolveResult({ rawText: event.rawText, value: event.value }),
      state: (event) =>
        matchTag(event.state, stateCases, () => {})(event.state),
    };
    const onEvent = (event) =>
      matchTag(event.type, eventCases, () => {})(event);
    const creation = this.workspace
      .createJob({ request, keyRef, metadata, onEvent })
      .then((created) => {
        onCreated?.(created);
        return created;
      })
      .catch((error) => {
        rejectResult(error);
        throw error;
      });
    const [job, result] = await Promise.all([creation, completed]);
    const validation = isRecord(result.value)
      ? { ok: true, value: result.value }
      : request.validate(result.rawText || job?.responseText || "");
    if (!validation.ok) throw new Error(validation.errors.join("；"));
    return { job, value: validation.value };
  }

  async stopRun(runId) {
    const run = this.activeConversation?.runs.find((item) => item.id === runId);
    if (!run || ["completed", "failed", "cancelled"].includes(run.status))
      return;
    const jobIds = [
      run.orchestratorJobId,
      ...run.dispatches.map((item) => item.jobId),
    ].filter(Boolean);
    await Promise.allSettled(
      jobIds.map((jobId) => this.workspace.abortJob(jobId)),
    );
    run.status = "cancelled";
    const event = this.activeConversation.messages.find(
      (message) => message.runId === runId && message.role === "orchestrator",
    );
    if (event) {
      event.status = "cancelled";
      event.content = "本轮已停止，已产生的结果会被保留。";
    }
    await this.save();
  }

  async createChatJob(
    current,
    assistant,
    request,
    keyRef,
    participantId = null,
  ) {
    try {
      const job = await this.workspace.createJob({
        request,
        keyRef,
        metadata: {
          source: `chat:${current.name}`,
          conversationId: current.id,
          participantId,
        },
        onEvent: (event) => {
          this.applyJobEvent(assistant, event);
        },
        onCreated: async (created) => {
          assistant.jobId = created.id;
          this.startJobPoller(assistant, created);
          await this.save();
        },
      });
      assistant.jobId = job.id;
      return job;
    } catch (error) {
      assistant.streaming = false;
      assistant.content = `Job 创建失败：${error.message}`;
      await this.save();
      throw error;
    }
  }

  close() {
    for (const subscription of this.jobSubscriptions.values())
      subscription.unsubscribe();
    this.jobSubscriptions.clear();
    for (const jobId of this.jobPollers.keys()) this.stopJobPoller(jobId);
  }
}
