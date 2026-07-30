<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import AppIcon from '../../../components/AppIcon.js'
import CodeEditor from '../../../components/CodeEditor.vue'
import UiButton from '../../../components/UiButton.vue'

const props = defineProps({ conversation: Object, renderMarkdown: Boolean })
const emit = defineEmits(['send'])
const input = ref('')
const openReasoning = ref(new Set())
const historyMode = ref(false)
const scrollRef = ref(null)

const messages = computed(() => props.conversation?.messages || [])

function isAtBottom() {
  const el = scrollRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

watch(messages, () => {
  if (isAtBottom()) scrollToBottom()
}, { deep: true })

watch(() => props.conversation?.id, scrollToBottom, { immediate: true })

function toggleReasoning(id) {
  const followOutput = isAtBottom()
  const next = new Set(openReasoning.value)
  next.has(id) ? next.delete(id) : next.add(id)
  openReasoning.value = next
  if (followOutput) scrollToBottom()
}

function send() {
  const content = input.value.trim()
  if (!content || historyMode.value) return
  const followOutput = isAtBottom()
  emit('send', content)
  input.value = ''
  if (followOutput) scrollToBottom()
}

function markdown(content) {
  return DOMPurify.sanitize(marked.parse(content || '', { breaks: true, gfm: true }))
}
</script>

<template>
  <section class="chat-view view">
    <div ref="scrollRef" class="chat-scroll">
      <div v-if="!messages.length" class="empty-state">这个对话还没有消息</div>
      <article v-for="message in messages" :key="message.id" class="chat-message" :class="message.role">
        <template v-if="message.role === 'tool'">
          <header><AppIcon name="tool" /><strong>{{ message.toolCall.name }}</strong><span class="badge positive">completed</span></header>
          <pre>{{ JSON.stringify(message.toolCall.arguments, null, 2) }}</pre>
          <p>{{ message.toolResult }}</p>
        </template>
        <template v-else>
          <UiButton v-if="message.reasoning" class="reasoning-toggle" variant="ghost" size="sm" @click="toggleReasoning(message.id)"><AppIcon name="chevron" size="12" />思维过程</UiButton>
          <p v-if="message.reasoning && openReasoning.has(message.id)" class="reasoning">{{ message.reasoning }}</p>
          <div v-if="renderMarkdown" class="markdown" v-html="markdown(message.content)" />
          <p v-else class="plain-message">{{ message.content }}</p>
          <div v-if="historyMode" class="message-actions"><UiButton variant="ghost" size="icon"><AppIcon name="edit" /></UiButton><UiButton variant="ghost" size="icon"><AppIcon name="trash" /></UiButton></div>
        </template>
      </article>
    </div>
    <div v-if="historyMode" class="history-banner">编辑消息会截断它之后的历史。</div>
    <footer class="chat-composer">
      <CodeEditor v-model="input" compact placeholder="输入消息" @submit="send" />
      <UiButton variant="ghost" size="icon" :active="historyMode" title="编辑历史" @click="historyMode = !historyMode"><AppIcon name="edit" /></UiButton>
      <UiButton variant="primary" size="icon" :disabled="historyMode || !input.trim()" title="发送" @click="send"><AppIcon name="send" /></UiButton>
    </footer>
  </section>
</template>
