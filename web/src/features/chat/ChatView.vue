<script setup>
import { ref, watchEffect, nextTick } from 'vue'
import { useAppUI } from '../../lib/contexts.js'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'

const props = defineProps({
  conv: Object,
  renderMarkdown: { type: Boolean, default: false },
})
const emit = defineEmits(['send', 'delete-msg', 'edit-msg', 'reedit', 'stop'])
const ui = useAppUI()

const chat = ref(null)
const chatInput = ref(null)

function handleReedit(index) {
  const message = props.conv?.messages[index]
  if (message?.role !== 'user') return
  chatInput.value?.setInput(message.content)
  emit('reedit', index)
}

function messageParts(message) {
  const thoughts = message.thoughts?.filter(Boolean) || (message.cot ? [message.cot] : [])
  if (!message.toolCall || !thoughts.length) return [message]

  return [
    { ...message, content: '', rawContent: '', toolCall: null, toolResult: null },
    { ...message, cot: null, thoughts: [], rawContent: '', content: '' },
  ]
}

watchEffect(() => {
  const msgs = props.conv?.messages
  if (msgs) {
    const last = msgs[msgs.length - 1]
    if (last) { void last.content; void last.cot; void last.toolResult }
    nextTick(() => { if (chat.value) chat.value.scrollTop = chat.value.scrollHeight })
  }
})

</script>

<template>
  <div id="chat" ref="chat">
    <div v-if="!conv" class="empty-msg">选择一个对话，或新建一个</div>
    <template v-else>
      <template v-for="(m, i) in conv.messages" :key="i">
        <MessageBubble
          v-for="(part, partIndex) in messageParts(m)" :key="`${i}-${partIndex}`"
          :message="part" :index="i" :conv-id="conv.id"
           :render-markdown="renderMarkdown"
           :is-streaming="ui.loading && m.role === 'assistant' && i === conv.messages.length - 1"
           :edit-mode="ui.historyEditing && !m.toolCall"
           @delete="emit('delete-msg', i)"
           @edit-save="(i, c) => emit('edit-msg', i, c)"
           @reedit="handleReedit(i)"
        />
      </template>
      <div v-if="!conv.messages.length" class="empty-msg">无消息</div>
    </template>
  </div>

  <div v-if="ui.historyEditing" class="history-edit-bar"><span>编辑或删除某条消息会截断它之后的历史。</span></div>

  <ChatInput
    ref="chatInput"
    :loading="ui.loading"
    :history-editing="ui.historyEditing"
    @send="emit('send', $event)"
    @stop="emit('stop')"
    @toggle-history="ui.historyEditing = !ui.historyEditing"
  />
</template>

<style scoped>
.history-edit-bar { min-height: 36px; padding: 5px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid var(--ol-bdr); background: var(--glass-panel); color: var(--text-dim); font-size: 12px; }
.history-edit-bar span { min-width: 0; }
</style>
