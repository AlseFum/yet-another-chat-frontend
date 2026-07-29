<script setup>
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.js'
import UiButton from '../../components/UiButton.vue'

const props = defineProps({ application: Object, active: Boolean })
const emit = defineEmits(['navigate', 'notify'])
const open = ref(true)

async function select(conversationId) {
  try {
    await props.application.select(conversationId)
    emit('navigate', 'chat')
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}

async function create() {
  try {
    props.application.create()
    await props.application.save()
    emit('navigate', 'chat')
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}
</script>

<template>
  <section class="side-section">
    <header @click="open = !open"><AppIcon name="message" /><span>对话</span><UiButton v-if="application.create" variant="ghost" size="icon" title="新建" @click.stop="create"><AppIcon name="plus" size="14" /></UiButton><AppIcon class="section-chevron" name="chevron" size="12" /></header>
    <div v-show="open" class="side-list">
      <button v-for="item in application.conversations" :key="item.id" :class="{ active: active && application.ui.activeConversationId === item.id }" @click="select(item.id)"><span>{{ item.name }}</span><AppIcon name="edit" size="12" /></button>
    </div>
  </section>
</template>
