<script setup>
import ChatView from './ui/ChatView.vue'

const props = defineProps({ application: Object, renderMarkdown: Boolean })
const emit = defineEmits(['notify'])

async function setPersona(personaId) {
  try { await props.application.setConversationPersona(personaId) } catch (error) { emit('notify', error.message, 'danger') }
}

async function togglePersona(personaId) {
  const conversation = props.application.activeConversation
  const ids = conversation.mode !== 'multi'
    ? conversation.participants.map(participant => participant.personaId)
    : conversation.personaIds.includes(personaId)
    ? conversation.personaIds.filter(id => id !== personaId)
    : [...conversation.personaIds, personaId]
  try { await props.application.setConversationPersonas(ids) } catch (error) { emit('notify', error.message, 'danger') }
}

async function setActivePersona(personaId) {
  try { await props.application.setActivePersona(personaId) } catch (error) { emit('notify', error.message, 'danger') }
}

async function removePersona(personaId) {
  const conversation = props.application.activeConversation
  try { await props.application.removeParticipant(personaId) } catch (error) { emit('notify', error.message, 'danger') }
}

async function sendMessage(content) {
  try {
    await props.application.sendMessage(content)
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}

async function stopRun(runId) {
  try { await props.application.stopRun(runId) } catch (error) { emit('notify', error.message, 'danger') }
}
</script>

<template>
  <ChatView :conversation="application.activeConversation" :personas="application.personas" :render-markdown="renderMarkdown" @send="sendMessage" @set-persona="setPersona" @toggle-persona="togglePersona" @set-active-persona="setActivePersona" @remove-persona="removePersona" @stop-run="stopRun" />
</template>
