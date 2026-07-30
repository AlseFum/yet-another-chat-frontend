<script setup>
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.js'
import UiButton from '../../components/UiButton.vue'
import UiModal from '../../components/UiModal.vue'

const props = defineProps({ application: Object, active: Boolean })
const emit = defineEmits(['navigate', 'notify'])
const open = ref(true)
const deleteId = ref(null)
const deleteOpen = ref(false)

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

async function remove() {
  try {
    await props.application.remove(deleteId.value)
    deleteOpen.value = false
    deleteId.value = null
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}
</script>

<template>
  <section class="side-section">
    <header @click="open = !open"><AppIcon name="message" /><span>对话</span><UiButton v-if="application.create" variant="ghost" size="icon" title="新建" @click.stop="create"><AppIcon name="plus" size="14" /></UiButton><AppIcon class="section-chevron" name="chevron" size="12" /></header>
    <div v-show="open" class="side-list">
      <div v-for="item in application.conversations" :key="item.id" class="conversation-entry" :class="{ active: active && application.ui.activeConversationId === item.id }">
        <button @click="select(item.id)"><span>{{ item.name }}</span></button>
        <UiButton class="conversation-delete" variant="ghost" size="icon" title="删除对话" @click="deleteId = item.id; deleteOpen = true"><AppIcon name="trash" size="14" /></UiButton>
      </div>
    </div>
  </section>
  <UiModal v-model="deleteOpen" title="删除对话" description="此操作无法撤销。">
    <p>确认删除“{{ application.conversations.find(item => item.id === deleteId)?.name }}”？正在运行的 Job 也会请求中止。</p>
    <template #footer="{ close }"><UiButton variant="ghost" @click="close">取消</UiButton><UiButton variant="danger" @click="remove"><AppIcon name="trash" />确认删除</UiButton></template>
  </UiModal>
</template>
