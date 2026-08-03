<script setup>
import ChatSection from '../applications/chat/ChatSection.vue'
import ResourceSection from '../applications/resource/ResourceSection.vue'
import TalkSection from '../applications/talk/TalkSection.vue'
import WorkflowSection from '../applications/workflow/WorkflowSection.vue'
import AppIcon from '../components/AppIcon.js'

const props = defineProps({ applications: Object, view: String })
const emit = defineEmits(['navigate', 'notify'])
const sections = [
  { id: 'chat', component: ChatSection },
  { id: 'talk', component: TalkSection },
  { id: 'workflow', component: WorkflowSection },
  { id: 'resource', component: ResourceSection },
]
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__brand"><span class="brand-glyph">YA</span><div><strong>Yet Another Agent</strong><small>local workspace</small></div></div>
    <component v-for="section in sections" :is="section.component" :key="section.id" :application="applications?.get(section.id)" :active="view === section.id" @navigate="emit('navigate', $event)" @notify="(...args) => emit('notify', ...args)" />

    <nav class="sidebar__utilities">
      <span>运行与连接</span>
      <button :class="{ active: view === 'keys' }" @click="emit('navigate', 'keys')"><AppIcon name="key" />API Key</button>
      <button :class="{ active: view === 'jobs' }" @click="emit('navigate', 'jobs')"><AppIcon name="bolt" />LLM 任务</button>
      <button :class="{ active: view === 'custom-settings' }" @click="emit('navigate', 'custom-settings')"><AppIcon name="settings" />应用设置</button>
    </nav>
  </aside>
</template>
