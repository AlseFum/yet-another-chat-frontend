<script setup>
import ChatView from './ui/ChatView.vue'

const props = defineProps({ application: Object, renderMarkdown: Boolean })
const emit = defineEmits(['notify'])

async function sendMessage(content) {
  try {
    await props.application.sendMessage(content)
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}
</script>

<template>
  <ChatView :conversation="application.activeConversation" :render-markdown="renderMarkdown" @send="sendMessage" />
</template>
