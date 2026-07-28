<script setup>
import { reactive } from 'vue'
import AppIcon from '../components/AppIcon.js'
import UiButton from '../components/UiButton.vue'

const props = defineProps({ workspace: Object, view: String, activeId: String })
const emit = defineEmits(['navigate', 'select', 'create'])
const open = reactive({ chat: true, resource: true })

const sections = [
  { id: 'chat', label: '对话', icon: 'message', items: () => props.workspace.conversations },
]
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__brand"><span class="brand-glyph">YA</span><div><strong>Yet Another Agent</strong><small>local workspace</small></div></div>
    <section v-for="section in sections" :key="section.id" class="side-section">
      <header @click="open[section.id] = !open[section.id]"><AppIcon :name="section.icon" /><span>{{ section.label }}</span><UiButton variant="ghost" size="icon" title="新建" @click.stop="emit('create', section.id)"><AppIcon name="plus" size="14" /></UiButton><AppIcon class="section-chevron" name="chevron" size="12" /></header>
      <div v-show="open[section.id]" class="side-list">
        <button v-for="item in section.items()" :key="item.id" :class="{ active: view === section.id && activeId === item.id }" @click="emit('select', section.id, item.id)"><span>{{ item.name }}</span><AppIcon name="edit" size="12" /></button>
      </div>
    </section>

    <section class="side-section resource-section">
      <header @click="open.resource = !open.resource"><AppIcon name="file" /><span>资源</span><span class="section-count">{{ Object.values(workspace.resources).flat().length }}</span><AppIcon class="section-chevron" name="chevron" size="12" /></header>
      <div v-show="open.resource" class="resource-nav">
        <button :class="{ active: view === 'resource' && activeId === 'text' }" @click="emit('select', 'resource', 'text')"><AppIcon name="file" />文本<span>{{ workspace.resources.text.length }}</span></button>
        <button :class="{ active: view === 'resource' && activeId === 'preset' }" @click="emit('select', 'resource', 'preset')"><AppIcon name="preset" />预设<span>{{ workspace.resources.preset.length }}</span></button>
        <button :class="{ active: view === 'resource' && activeId === 'tool' }" @click="emit('select', 'resource', 'tool')"><AppIcon name="tool" />工具<span>{{ workspace.resources.tool.length }}</span></button>
      </div>
    </section>

    <nav class="sidebar__utilities">
      <span>运行与连接</span>
      <button :class="{ active: view === 'keys' }" @click="emit('navigate', 'keys')"><AppIcon name="key" />API Key</button>
      <button :class="{ active: view === 'jobs' }" @click="emit('navigate', 'jobs')"><AppIcon name="bolt" />LLM 任务</button>
    </nav>
  </aside>
</template>
