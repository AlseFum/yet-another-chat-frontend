<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Editor from '../components/Editor.vue'
import Button from '../components/Button.vue'
import Icon from '../components/Icon.vue'
const props = defineProps({ item: Object }); const emit = defineEmits(['back', 'save', 'highlight']); const draft = reactive({ name: props.item?.name || '', content: props.item?.content || '' }); const showTheme = ref(false); const preview = ref(false); const text = computed(() => props.item)
watch(() => props.item?.name, () => { draft.name = props.item?.name || ''; draft.content = props.item?.content || ''; showTheme.value = false; preview.value = false })
const style = name => typeof text.value?.highlightTheme?.[name] === 'string' ? { color: text.value.highlightTheme[name] } : (text.value?.highlightTheme?.[name] || {})
function clearHighlights() { if (text.value) { delete text.value.highlightRules; delete text.value.highlightTheme; showTheme.value = false } }
function setStyle(name, property, value) { if (text.value) text.value.highlightTheme = { ...text.value.highlightTheme, [name]: { ...style(name), [property]: value } } }
function renderPreview() { return DOMPurify.sanitize(marked.parse(draft.content || '')) }
</script>
<template><section class="editor-view"><div class="editor-header"><Button size="sm" @click="emit('back')"><Icon name="back" />返回</Button><span class="editor-title"><Icon name="file" />编辑文本</span><Button size="sm" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</Button><Button size="sm" @click="emit('save', draft)"><Icon name="check" />保存</Button><Button size="sm" @click="emit('highlight', draft)"><Icon name="palette" />高亮</Button><Button v-if="text?.highlightRules" size="sm" @click="showTheme = !showTheme"><Icon name="palette" />配色</Button></div><div class="editor-body"><input v-model="draft.name" class="editor-name" placeholder="文本名称" /><Editor v-if="!preview" v-model="draft.content" language="markdown" height="" :highlight-rules="text?.highlightRules" :highlight-theme="text?.highlightTheme || {}" /><article v-else class="markdown-preview" v-html="renderPreview()" /><div v-if="text?.highlightRules && showTheme" class="hl-theme-panel"><div class="hl-theme-header"><span><Icon name="palette" />配色方案</span><Button size="sm" variant="danger" @click="clearHighlights">清除高亮</Button></div><div class="hl-token-list"><div v-for="name in Object.keys(text.highlightTheme || {}).sort()" :key="name" class="hl-token-row"><span class="hl-token-label" :style="{ color: style(name).color }">{{ name }}</span><input type="color" :value="style(name).color || '#c0c8d4'" class="hl-color-picker" @input="setStyle(name, 'color', $event.target.value)" /><Button class="hl-style-btn" size="sm" :class="{ active: style(name).bold }" @click="setStyle(name, 'bold', !style(name).bold)">B</Button></div></div></div></div></section></template>
