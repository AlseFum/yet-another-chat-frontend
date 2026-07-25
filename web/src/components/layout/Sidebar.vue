<script setup>
import { ref, nextTick } from 'vue'
import SectionItem from '../SectionItem.vue'
import Section from '../Section.vue'
import Button from '../Button.vue'
import Icon from '../Icon.vue'

const props = defineProps({
  conversations: Array,
  activeId: String,
  texts: Array,
  tools: Array,
  presets: Array,
  workflows: Array,
  activeWfId: String,
  talks: Array,
  activeTalkId: String,
  currentView: String,
})
const emit = defineEmits([
  'select', 'new-conv', 'delete-conv', 'rename-conv', 'clear-history',
  'open-text-editor', 'delete-text',
  'open-tool-editor', 'delete-tool',
  'open-preset-editor', 'delete-preset',
  'select-workflow', 'new-workflow', 'delete-workflow',
  'select-talk', 'open-talk-creator', 'delete-talk',
  'open-api-keys', 'open-llm-jobs',
])

const editingConv = ref(null)
const convName = ref('')
const textsOpen = ref(true)
const toolsOpen = ref(true)
const presetsOpen = ref(true)
const workflowsOpen = ref(true)
const talksOpen = ref(true)

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function startConvRename(id, e) {
  e.stopPropagation()
  editingConv.value = id
  convName.value = props.conversations.find(c => c.id === id)?.name || ''
  nextTick(() => { document.querySelector('.conv-name-input')?.focus() })
}
function commitConvRename(id) {
  if (convName.value.trim()) emit('rename-conv', id, convName.value.trim())
  editingConv.value = null
}
function cancelConvRename() { editingConv.value = null }
</script>

<template>
  <Section title="对话" icon="message" :collapsible="false" content-min-height="60px" content-max-height="45vh" content-padding="4px 0">
    <template #actions>
      <Button id="clearHistory" variant="ghost" size="icon" title="清空当前对话历史" @click="emit('clear-history')"><Icon name="trash" /></Button>
      <Button variant="ghost" size="icon" title="新建对话" @click="emit('new-conv')">+</Button>
    </template>
    <SectionItem
      v-for="c in conversations" :key="c.id"
      :active="c.id === activeId"
      @select="emit('select', c.id)"
      @double-click="startConvRename(c.id, $event)"
    >
      <input
        v-if="editingConv === c.id"
        v-model="convName"
        class="conv-name-input"
        @keydown.enter="commitConvRename(c.id)"
        @keydown.esc="cancelConvRename"
        @blur="cancelConvRename"
        @click.stop
      />
      <span v-else>{{ esc(c.name) }}</span>
       <template #actions><Button variant="ghost" size="icon" title="重命名对话" @click="startConvRename(c.id, $event)"><Icon name="edit" /></Button><Button variant="ghost" size="icon" title="删除对话" @click="emit('delete-conv', c.id)"><Icon name="close" /></Button></template>
    </SectionItem>
  </Section>

  <Section v-model:open="textsOpen" title="文本" icon="file" compact separated content-max-height="200px">
    <template #actions><Button variant="ghost" size="icon" @click="emit('open-text-editor', null)">+</Button></template>
      <SectionItem v-for="t in texts" :key="t.name" compact @select="emit('open-text-editor', t.name)">
        <span>{{ esc(t.name) }}</span>
        <template #actions><Button variant="ghost" size="icon" @click="emit('delete-text', t.name)"><Icon name="close" /></Button></template>
      </SectionItem>
  </Section>

  <Section v-model:open="toolsOpen" title="工具" icon="tool" compact separated content-max-height="200px">
    <template #actions><Button variant="ghost" size="icon" @click="emit('open-tool-editor', null)">+</Button></template>
      <SectionItem v-for="t in tools" :key="t.name" compact @select="emit('open-tool-editor', t.name)">
        <span>{{ esc(t.name) }}</span>
        <template #actions><Button variant="ghost" size="icon" @click="emit('delete-tool', t.name)"><Icon name="close" /></Button></template>
      </SectionItem>
  </Section>

  <Section v-model:open="presetsOpen" title="预设" icon="list" compact separated content-max-height="200px">
    <template #actions><Button variant="ghost" size="icon" @click="emit('open-preset-editor', null)">+</Button></template>
      <SectionItem v-for="p in presets" :key="p.id" compact @select="emit('open-preset-editor', p.id)">
        <span>{{ esc(p.name) }}</span>
        <template #actions><Button variant="ghost" size="icon" @click="emit('delete-preset', p.id)"><Icon name="close" /></Button></template>
      </SectionItem>
  </Section>

  <Section v-model:open="workflowsOpen" title="流程" icon="workflow" compact separated content-max-height="200px">
    <template #actions><Button variant="ghost" size="icon" @click="emit('new-workflow')">+</Button></template>
      <SectionItem
        v-for="w in workflows" :key="w.id"
        :active="currentView === 'workflow' && w.id === activeWfId"
        @select="emit('select-workflow', w.id)"
      >
        <span>{{ esc(w.name) }}</span>
        <template #actions><Button variant="ghost" size="icon" @click="emit('delete-workflow', w.id)"><Icon name="close" /></Button></template>
      </SectionItem>
  </Section>

  <Section v-model:open="talksOpen" title="Talk" icon="sparkles" compact separated content-max-height="200px">
    <template #actions><Button variant="ghost" size="icon" title="创建 Talk" @click="emit('open-talk-creator')">+</Button></template>
      <SectionItem
        v-for="talk in talks" :key="talk.id"
        :active="currentView === 'talk' && talk.id === activeTalkId"
        @select="emit('select-talk', talk.id)"
      >
        <span>{{ esc(talk.name) }}</span>
        <template #actions><Button variant="ghost" size="icon" title="删除 Talk" @click="emit('delete-talk', talk.id)"><Icon name="close" /></Button></template>
      </SectionItem>
  </Section>

  <nav class="sidebar-utilities" aria-label="运行与连接">
    <span>运行与连接</span>
    <button :class="{ active: currentView === 'api-keys' }" :aria-current="currentView === 'api-keys' ? 'page' : undefined" @click="emit('open-api-keys')"><Icon name="key" size="15" />API Key</button>
    <button :class="{ active: currentView === 'llm-jobs' }" :aria-current="currentView === 'llm-jobs' ? 'page' : undefined" @click="emit('open-llm-jobs')"><Icon name="bolt" size="15" />LLM 任务</button>
  </nav>
</template>

<style scoped>
.sidebar-utilities { display: grid; gap: 4px; margin-top: auto; padding: 12px 10px 14px; border-top: 1px solid var(--ol-bdr); }
.sidebar-utilities > span { padding: 0 6px 4px; color: var(--text-faint); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.sidebar-utilities button { display: flex; align-items: center; gap: 8px; min-height: 32px; width: 100%; padding: 0 8px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--text-dim); cursor: pointer; font: inherit; font-size: 12px; text-align: left; }
.sidebar-utilities button:hover { background: var(--ol-btn); color: var(--text); }
.sidebar-utilities button.active { border-color: rgba(16,185,129,.22); background: rgba(16,185,129,.08); color: var(--accent2); }
</style>
