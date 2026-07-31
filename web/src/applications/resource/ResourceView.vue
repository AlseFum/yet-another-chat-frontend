<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../../components/AppIcon.js'
import CodeEditor from '../../components/CodeEditor.vue'
import UiButton from '../../components/UiButton.vue'
import UiDrawer from '../../components/UiDrawer.vue'
import UiModal from '../../components/UiModal.vue'

const props = defineProps({ application: Object })
const emit = defineEmits(['notify', 'open-sidebar'])
const selectedId = ref('')
const deleteName = ref('')
const deleteOpen = ref(false)
const deleting = ref(false)
const highlightsOpen = ref(false)
const mobile = ref(false)
const saveStatus = ref('saved')
let saveTimer = null
const labels = { text: ['文本', 'file'], preset: ['预设', 'preset'], tool: ['工具', 'tool'] }
const type = computed(() => props.application.activeType)
const items = computed(() => props.application[type.value] || [])
const selected = computed(() => items.value.find(item => item.id === selectedId.value) || items.value[0])
const language = computed(() => type.value === 'tool' ? 'javascript' : 'markdown')
const toolFunctionName = computed(() => {
  const name = String(selected.value?.name || 'tool')
    .normalize('NFKC')
    .replace(/[^\p{ID_Continue}$]/gu, '_')
  return /^[\p{ID_Start}$_]/u.test(name) ? name : `_${name}`
})
const autoSave = computed(() => props.application.workspace?.getCustomSettings(props.application.id)?.autoSave !== false)

function updateMobile() { mobile.value = window.matchMedia('(max-width: 760px)').matches }
function backToList() { selectedId.value = '' }

watch(type, () => { selectedId.value = ''; highlightsOpen.value = false })

onMounted(() => {
  updateMobile()
  window.addEventListener('resize', updateMobile)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateMobile))
onBeforeUnmount(() => window.clearTimeout(saveTimer))

watch(() => selected.value ? JSON.stringify(selected.value) : '', () => {
  if (!autoSave.value || !selected.value) return
  saveStatus.value = 'pending'
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    try {
      await props.application.save()
      saveStatus.value = 'saved'
    } catch (error) {
      saveStatus.value = 'error'
      emit('notify', error.message, 'danger')
    }
  }, 650)
}, { flush: 'post' })

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
  saveStatus.value = 'saving'
  try {
    await props.application.save()
    saveStatus.value = 'saved'
  } catch (error) {
    saveStatus.value = 'error'
    emit('notify', error.message, 'danger')
  }
}

const saveLabel = computed(() => ({ saved: '已保存', pending: '待保存', saving: '保存中', error: '保存失败' }[saveStatus.value]))

async function toggleAutoSave() {
  try {
    if (autoSave.value) window.clearTimeout(saveTimer)
    await props.application.workspace.updateCustomSetting(props.application.id, 'autoSave', !autoSave.value)
    saveStatus.value = 'saved'
    emit('notify', autoSave.value ? '已切换为自动保存' : '已切换为手动保存')
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}

async function generate() {
  try {
    await props.application.generate(type.value, selected.value)
    emit('notify', '内容生成完成')
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}

async function generateHighlights() {
  try {
    await props.application.generateHighlights(selected.value)
    emit('notify', '高亮规则已生成')
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}

function removeHighlight(index) {
  selected.value.highlights.splice(index, 1)
}

function addHighlight() {
  selected.value.highlights ||= []
  selected.value.highlights.push({ pattern: '', className: 'keyword', description: '', color: '', background: '', bold: false, italic: false, underline: false, strikethrough: false, enabled: true })
  highlightsOpen.value = true
}

async function remove() {
  deleting.value = true
  try {
    const index = items.value.findIndex(item => item.id === selected.value?.id)
    await props.application.remove(type.value, selected.value.id)
    selectedId.value = items.value[index]?.id || items.value[index - 1]?.id || ''
    deleteOpen.value = false
    deleteName.value = ''
    emit('notify', '资源已删除')
  } catch (error) {
    deleting.value = false
    emit('notify', error.message, 'danger')
  }
}

function confirmRemove() {
  deleteName.value = selected.value?.name || '未命名资源'
  deleting.value = false
  deleteOpen.value = true
}
</script>

<template>
    <section class="resource-view view" :class="{ 'resource-view--editing': mobile && selectedId }">
    <aside class="resource-list">
      <header><div class="resource-list__title"><UiButton v-if="mobile" variant="ghost" size="icon" title="返回资源分类" @click="emit('open-sidebar')"><AppIcon name="back" /></UiButton><div><p class="eyebrow">RESOURCE</p><h2>{{ labels[type][0] }}</h2></div></div><UiButton variant="ghost" size="icon" title="新建资源" @click="add"><AppIcon name="plus" /></UiButton></header>
      <button v-for="item in items" :key="item.id" :class="{ active: selected?.id === item.id }" @click="selectedId = item.id"><AppIcon :name="labels[type][1]" /><span>{{ item.name }}</span></button>
    </aside>
    <Transition name="resource-editor" mode="out-in">
    <main v-if="selected && (!mobile || selectedId)" class="resource-editor">
       <header><div><UiButton v-if="mobile" variant="ghost" size="icon" title="返回资源列表" @click="backToList"><AppIcon name="back" /></UiButton><div><p class="eyebrow">{{ type.toUpperCase() }}</p><h1>编辑{{ labels[type][0] }}</h1></div></div><div class="resource-editor__actions"><UiButton :disabled="selected.generating" @click="generate"><AppIcon name="robot" />{{ selected.generating ? '生成中' : 'AI 生成' }}</UiButton><div class="resource-save-group"><span v-if="autoSave" class="resource-save-status" :class="`is-${saveStatus}`"><AppIcon :name="saveStatus === 'error' ? 'info' : 'check'" size="13" />{{ saveLabel }}</span><UiButton v-else variant="primary" @click="save"><AppIcon name="check" />保存</UiButton><UiButton class="resource-save-mode" variant="ghost" size="icon" :title="autoSave ? '切换为手动保存' : '切换为自动保存'" :aria-label="autoSave ? '切换为手动保存' : '切换为自动保存'" @click="toggleAutoSave"><AppIcon :name="autoSave ? 'bolt' : 'edit'" size="14" /></UiButton></div></div></header>
      <div class="resource-fields">
        <label>名称<input v-model="selected.name" class="field resource-name" /></label>
         <label v-if="type === 'tool'">功能描述<input v-model="selected.description" class="field" /></label>
         <label v-if="type === 'tool'">调用 args<textarea v-model="selected.args" class="field tool-args" rows="4" placeholder="描述工具调用时传入的 ctx.args" /></label>
         <div v-if="type === 'preset'" class="resource-params"><label>Temperature<input v-model="selected.temperature" class="field" /></label><label>Max tokens<input v-model="selected.maxTokens" class="field" /></label></div>
      </div>
      <div v-if="type === 'tool'" class="tool-code-editor">
        <code class="tool-code-editor__prefix">async function {{ toolFunctionName }}(ctx) {</code>
        <CodeEditor v-model="selected.content" :language="language" />
        <code class="tool-code-editor__suffix">}</code>
      </div>
      <CodeEditor v-else v-model="selected.content" :language="language" :highlights="type === 'text' ? selected.highlights : []" />
      <UiDrawer v-if="type === 'text'" v-model="highlightsOpen" title="高亮规则" description="管理当前文本的匹配和显示样式。">
        <div class="resource-highlights-drawer">
          <header class="resource-highlights-drawer__toolbar"><span>{{ selected.highlights?.length || 0 }} 条规则</span><div><UiButton size="sm" @click="addHighlight"><AppIcon name="plus" />添加</UiButton><UiButton size="sm" @click="generateHighlights"><AppIcon name="robot" />AI 生成</UiButton></div></header>
          <div v-for="(rule, index) in (selected.highlights || [])" :key="index" class="resource-highlight-rule">
            <div class="resource-highlight-rule__main">
              <span class="resource-highlight-rule__description">{{ rule.description || '自动生成的高亮样式' }}</span>
              <UiButton variant="ghost" size="icon" title="删除规则" @click="removeHighlight(index)"><AppIcon name="trash" size="13" /></UiButton>
            </div>
          <div class="resource-highlight-rule__style">
              <label class="highlight-color highlight-color--text" title="文字颜色"><AppIcon name="text-color" size="14" /><input v-model="rule.color" type="color" aria-label="文字颜色" /></label>
              <label class="highlight-color highlight-color--background" title="背景颜色"><AppIcon name="fill" size="14" /><input v-model="rule.background" type="color" aria-label="背景颜色" /></label>
              <label class="highlight-check" title="粗体"><input v-model="rule.bold" type="checkbox" aria-label="粗体" /><strong>B</strong></label>
              <label class="highlight-check" title="斜体"><input v-model="rule.italic" type="checkbox" aria-label="斜体" /><AppIcon name="italic" size="14" /></label>
              <label class="highlight-check" title="下划线"><input v-model="rule.underline" type="checkbox" aria-label="下划线" /><AppIcon name="underline" size="14" /></label>
              <label class="highlight-check" title="中划线"><input v-model="rule.strikethrough" type="checkbox" aria-label="中划线" /><AppIcon name="strikethrough" size="14" /></label>
              <label class="highlight-check" title="启用"><input v-model="rule.enabled" type="checkbox" aria-label="启用" /><AppIcon :name="rule.enabled ? 'eye' : 'eye-off'" size="14" /></label>
          </div>
        </div>
        <p v-if="!selected.highlights?.length" class="empty-state">暂无高亮规则</p>
        </div>
      </UiDrawer>
      <footer><span>保存后写入当前 Workspace</span><div class="resource-editor__footer-actions"><UiButton v-if="type === 'text'" class="resource-highlights-button" @click="highlightsOpen = true"><AppIcon name="file" /><span>高亮规则</span><small>{{ selected.highlights?.length || 0 }} 条</small></UiButton><UiButton variant="danger" @click="confirmRemove"><AppIcon name="trash" />删除</UiButton></div></footer>
    </main>
    </Transition>
    <UiModal v-model="deleteOpen" title="删除资源" description="此操作无法撤销。">
      <p>{{ deleting ? `正在删除资源“${deleteName}”…` : `确认删除资源“${deleteName}”？删除后无法恢复。` }}</p>
      <template #footer="{ close }"><UiButton variant="ghost" :disabled="deleting" @click="close">取消</UiButton><UiButton variant="danger" :disabled="deleting" @click="remove"><AppIcon name="trash" />{{ deleting ? '正在删除' : '确认删除' }}</UiButton></template>
    </UiModal>
  </section>
</template>
