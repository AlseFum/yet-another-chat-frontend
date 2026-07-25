<script setup>
import { ref, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Editor from '../../components/Editor.vue'
import Button from '../../components/Button.vue'
import Icon from '../../components/Icon.vue'
import ToolCallCard from './ToolCallCard.vue'
import { toggleSet } from './state.js'

const props = defineProps({
  message: { type: Object, required: true },
  index: { type: Number, required: true },
  convId: { type: String, default: '' },
  renderMarkdown: { type: Boolean, default: false },
  isStreaming: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
})
const emit = defineEmits(['delete', 'edit-save', 'reedit'])

const editing = ref(false)
const editText = ref('')
const focusEdit = ref(false)
const expandedThoughts = ref(new Set())
const expandedRaw = ref(new Set())

function renderMessage(content) {
  return DOMPurify.sanitize(marked.parse(content || '', { async: false, breaks: true, gfm: true }))
}

function startEdit() {
    if (props.message.toolCall || !props.editMode || props.isStreaming) return
  editing.value = true
  editText.value = props.message.content
  focusEdit.value = true
  nextTick(() => { focusEdit.value = false })
}

function saveEdit() {
  emit('edit-save', props.index, editText.value)
  editing.value = false
}

function cancelEdit() { editing.value = false }

function thoughts(m) { return m.thoughts?.filter(Boolean) || (m.cot ? [m.cot] : []) }

function thoughtKey(ti) { return `${props.convId}:${props.index}:${ti}` }
function isThoughtOpen(ti) { return expandedThoughts.value.has(thoughtKey(ti)) }
function toggleThought(ti) { toggleSet(expandedThoughts, thoughtKey(ti)) }

function rawKey() { return `${props.convId}:${props.index}` }
function isRawOpen() { return expandedRaw.value.has(rawKey()) }
function toggleRaw() { toggleSet(expandedRaw, rawKey()) }
</script>

<template>
  <div
    class="msg"
    :class="{
      'msg-editing': editing,
      'tool-call': message.toolCall,
      [message.role]: !message.toolCall,
      streaming: isStreaming && message.role === 'assistant' && !message.toolCall,
    }"
    @dblclick="startEdit"
  >
    <template v-if="editing">
      <Editor v-model="editText" language="markdown" height="120px" :autofocus="focusEdit" />
      <div class="edit-actions">
        <Button size="sm" title="保存" @click="saveEdit"><Icon name="check" /></Button>
        <Button size="sm" title="取消" @click="cancelEdit"><Icon name="close" /></Button>
      </div>
    </template>

    <template v-else-if="!message.toolCall">
      <template v-for="(thought, ti) in thoughts(message)" :key="ti">
        <Button class="cot-toggle" :class="{ expanded: isThoughtOpen(ti) }" variant="ghost" size="sm" :aria-expanded="isThoughtOpen(ti)" @click.stop="toggleThought(ti)">
          <Icon class="cot-chevron" name="chevron-down" size="14" />思维过程
        </Button>
        <div v-if="isThoughtOpen(ti)" class="cot">{{ thought }}</div>
      </template>
      <template v-if="message.rawContent && message.rawContent !== message.content">
        <Button class="cot-toggle" :class="{ expanded: isRawOpen() }" variant="ghost" size="sm" :aria-expanded="isRawOpen()" @click.stop="toggleRaw">
          <Icon class="cot-chevron" name="chevron-down" size="14" />原始输出
        </Button>
        <div v-if="isRawOpen()" class="cot">{{ message.rawContent }}</div>
      </template>
      <div v-if="renderMarkdown" class="message-markdown" v-html="renderMessage(message.content)" />
      <pre v-else>{{ message.content }}</pre>
    </template>

    <template v-if="message.toolCall">
      <ToolCallCard :call="message.toolCall" :result="message.toolResult" />
    </template>

    <div v-if="editMode && !message.toolCall && !editing" class="message-edit-actions">
      <Button v-if="message.role === 'user'" variant="ghost" size="icon" title="从此消息重新编辑" aria-label="从此消息重新编辑" @click.stop="emit('reedit')"><Icon name="back" /></Button>
      <Button variant="ghost" size="icon" title="编辑此消息并截断后续历史" aria-label="编辑此消息" @click.stop="startEdit"><Icon name="edit" /></Button>
      <Button variant="ghost" size="icon" title="删除消息" aria-label="删除消息" @click.stop="emit('delete')"><Icon name="close" /></Button>
    </div>
  </div>
</template>
