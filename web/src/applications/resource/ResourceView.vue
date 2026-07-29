<script setup>
import { computed, ref, watch } from 'vue'
import AppIcon from '../../components/AppIcon.js'
import CodeEditor from '../../components/CodeEditor.vue'
import UiButton from '../../components/UiButton.vue'

const props = defineProps({ application: Object })
const emit = defineEmits(['notify'])
const selectedId = ref('')
const labels = { text: ['文本', 'file'], preset: ['预设', 'preset'], tool: ['工具', 'tool'] }
const type = computed(() => props.application.activeType)
const items = computed(() => props.application[type.value] || [])
const selected = computed(() => items.value.find(item => item.id === selectedId.value) || items.value[0])
const language = computed(() => type.value === 'tool' ? 'javascript' : 'markdown')

watch(type, () => { selectedId.value = '' })

async function add() {
  try {
    const item = props.application.create(type.value)
    await props.application.save()
    selectedId.value = item.id
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}

async function save() {
  try {
    await props.application.save()
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}
</script>

<template>
  <section class="resource-view view">
    <aside class="resource-list">
      <header><div><p class="eyebrow">RESOURCE</p><h2>{{ labels[type][0] }}</h2></div><UiButton variant="ghost" size="icon" @click="add"><AppIcon name="plus" /></UiButton></header>
      <button v-for="item in items" :key="item.id" :class="{ active: selected?.id === item.id }" @click="selectedId = item.id"><AppIcon :name="labels[type][1]" /><span>{{ item.name }}</span><AppIcon name="chevron" size="12" /></button>
    </aside>
    <main v-if="selected" class="resource-editor">
      <header><div><p class="eyebrow">{{ type.toUpperCase() }}</p><h1>编辑{{ labels[type][0] }}</h1></div><div><UiButton><AppIcon name="robot" />AI 生成</UiButton><UiButton variant="primary" @click="save"><AppIcon name="check" />保存</UiButton></div></header>
      <div class="resource-fields">
        <label>名称<input v-model="selected.name" class="field resource-name" /></label>
        <label v-if="type === 'tool'">功能描述<input v-model="selected.description" class="field" /></label>
        <div v-if="type === 'preset'" class="resource-params"><label>Temperature<input v-model="selected.temperature" class="field" /></label><label>Max tokens<input v-model="selected.maxTokens" class="field" /></label></div>
      </div>
      <CodeEditor v-model="selected.content" :language="language" />
      <footer><span>保存后写入当前 Workspace</span><UiButton variant="danger"><AppIcon name="trash" />删除</UiButton></footer>
    </main>
  </section>
</template>
