<script setup>
import { computed, ref, watch, nextTick } from "vue";
import DOMPurify from "dompurify";
import { marked } from "marked";
import AppIcon from "../../../components/AppIcon.js";
import CodeEditor from "../../../components/CodeEditor.vue";
import UiButton from "../../../components/UiButton.vue";

const props = defineProps({
  conversation: Object,
  personas: { type: Array, default: () => [] },
  texts: { type: Array, default: () => [] },
  renderMarkdown: Boolean,
});
const emit = defineEmits([
  "send",
  "set-persona",
  "set-active-persona",
  "remove-persona",
  "stop-run",
]);
const input = ref("");
const openReasoning = ref(new Set());
const historyMode = ref(false);
const scrollRef = ref(null);

const messages = computed(() => props.conversation?.messages || []);

function isAtBottom() {
  const el = scrollRef.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
    }
  });
}

watch(
  messages,
  () => {
    if (isAtBottom()) scrollToBottom();
  },
  { deep: true },
);

watch(() => props.conversation?.id, scrollToBottom, { immediate: true });

function toggleReasoning(id) {
  const followOutput = isAtBottom();
  const next = new Set(openReasoning.value);
  next.has(id) ? next.delete(id) : next.add(id);
  openReasoning.value = next;
  if (followOutput) scrollToBottom();
}

function send() {
  const content = input.value.trim();
  if (!content || historyMode.value) return;
  const followOutput = isAtBottom();
  emit("send", content);
  input.value = "";
  if (followOutput) scrollToBottom();
}

function markdown(content) {
  return DOMPurify.sanitize(
    marked.parse(content || "", { breaks: true, gfm: true }),
  );
}

function participantName(participant) {
  const samePersona =
    props.conversation?.participants?.filter(
      (item) => item.personaId === participant?.personaId,
    ) || [];
  const index = samePersona.findIndex((item) => item.id === participant?.id);
  const personaName =
    props.personas.find((persona) => persona.id === participant?.personaId)
      ?.name ||
    participant?.personaId ||
    participant?.id;
  return (
    participant?.alias ||
    (samePersona.length > 1 ? `${personaName} #${index + 1}` : personaName)
  );
}

function speakerName(message) {
  return (
    participantName(
      props.conversation?.participants?.find(
        (item) => item.id === message.speakerId,
      ),
    ) ||
    message.personaId ||
    message.speakerId
  );
}
</script>

<template>
  <section class="chat-view view">
    <header
      v-if="conversation && ['single', 'multi'].includes(conversation.mode)"
      class="chat-persona-toolbar"
    >
      <div v-if="conversation.mode !== 'multi'" class="chat-persona-select">
        <AppIcon name="scope-chat" size="14" /><select
          :value="conversation.personaId || ''"
          aria-label="选择 Persona"
          @change="emit('set-persona', $event.target.value)"
        >
          <option value="" disabled>选择 Persona</option>
          <option
            v-for="persona in personas"
            :key="persona.id"
            :value="persona.id"
          >
            {{ persona.name }}
          </option>
        </select>
      </div>
      <div v-else class="chat-persona-multi">
        <div class="chat-persona-chips">
          <span
            v-for="participant in conversation.participants"
            :key="participant.id"
            class="chat-persona-chip"
            :class="{
              selected: true,
              active: conversation.activePersonaId === participant.id,
            }"
            ><button
              type="button"
              class="chat-persona-chip__name"
              title="查看此 Persona 实例"
              @click="emit('set-active-persona', participant.id)"
            >
              <AppIcon name="message" size="12" />{{
                participantName(participant)
              }}</button
            ><button
              type="button"
              class="chat-persona-chip__remove"
              title="移除 Persona 实例"
              aria-label="移除 Persona 实例"
              @click="emit('remove-persona', participant.id)"
            >
              <AppIcon name="close" size="10" /></button
          ></span>
        </div>
        <small>本次发送会让所有实例分别回复；点击 × 移除实例</small>
      </div>
    </header>
    <div
      v-if="
        conversation &&
        conversation.mode !== 'raw' &&
        !personas.length
      "
      class="chat-persona-empty"
    >
      <AppIcon name="info" size="14" />请先在 Resource 中创建 Persona。
    </div>
    <div ref="scrollRef" class="chat-scroll">
      <div v-if="!messages.length" class="empty-state">这个对话还没有消息</div>
      <article
        v-for="message in messages"
        :key="message.id"
        class="chat-message"
        :class="message.role"
      >
        <template v-if="message.role === 'orchestrator'"
          ><header class="orchestrator-event__head">
            <AppIcon name="condition" /><strong>Orchestrator</strong
            ><span
              class="badge"
              :class="message.status === 'failed' ? 'danger' : 'positive'"
              >{{ message.status }}</span
            >
          </header>
          <p>{{ message.content }}</p>
          <UiButton
            v-if="
              ['planning', 'dispatching'].includes(
                conversation.runs.find((run) => run.id === message.runId)
                  ?.status,
              )
            "
            size="sm"
            variant="ghost"
            @click="emit('stop-run', message.runId)"
            ><AppIcon name="stop" />停止本轮</UiButton
          ></template
        >
        <template v-else-if="message.role === 'tool'">
          <header>
            <AppIcon name="tool" /><strong>{{ message.toolCall.name }}</strong
            ><span class="badge positive">completed</span>
          </header>
          <pre>{{ JSON.stringify(message.toolCall.arguments, null, 2) }}</pre>
          <p>{{ message.toolResult }}</p>
        </template>
        <template v-else>
          <div
            v-if="message.role === 'assistant' && message.speakerId"
            class="chat-message__speaker"
          >
            <AppIcon name="message" size="12" />{{ speakerName(message) }}
          </div>
          <div v-if="message.kind === 'action'" class="chat-action-meta">
            <AppIcon name="bolt" size="12" /><span>{{ message.actionId }}</span
            ><span v-if="message.actionResult" class="badge positive">{{
              message.actionResult.status
            }}</span>
          </div>
          <UiButton
            v-if="message.reasoning"
            class="reasoning-toggle"
            variant="ghost"
            size="sm"
            @click="toggleReasoning(message.id)"
            ><AppIcon name="chevron" size="12" />思维过程</UiButton
          >
          <p
            v-if="message.reasoning && openReasoning.has(message.id)"
            class="reasoning"
          >
            {{ message.reasoning }}
          </p>
          <div
            v-if="renderMarkdown"
            class="markdown"
            v-html="markdown(message.content)"
          />
          <p v-else class="plain-message">{{ message.content }}</p>
          <div v-if="historyMode" class="message-actions">
            <UiButton variant="ghost" size="icon"
              ><AppIcon name="edit" /></UiButton
            ><UiButton variant="ghost" size="icon"
              ><AppIcon name="trash"
            /></UiButton>
          </div>
        </template>
      </article>
    </div>
    <div v-if="historyMode" class="history-banner">
      编辑消息会截断它之后的历史。
    </div>
    <footer class="chat-composer">
      <CodeEditor
        v-model="input"
        :text-resources="texts"
        compact
        placeholder="输入消息；输入 @ 引用文本"
        @submit="send"
      />
      <UiButton
        variant="ghost"
        size="icon"
        :active="historyMode"
        title="编辑历史"
        @click="historyMode = !historyMode"
        ><AppIcon name="edit"
      /></UiButton>
      <UiButton
        variant="primary"
        size="icon"
        :disabled="historyMode || !input.trim()"
        title="发送"
        @click="send"
        ><AppIcon name="send"
      /></UiButton>
    </footer>
  </section>
</template>
