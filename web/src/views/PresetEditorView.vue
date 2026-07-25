<script setup>
import { reactive, ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Editor from '../components/Editor.vue'; import Button from '../components/Button.vue'; import Icon from '../components/Icon.vue'
import { toast } from '../components/Toast.vue'
import { useTextMention } from '../lib/useTextMention.js'
const props = defineProps({ item: Object }); const emit = defineEmits(['back', 'save', 'write']); const draft = reactive({ name: props.item?.name || '', content: props.item?.prompt || '', temperature: props.item?.temperature || '', maxTokens: props.item?.maxTokens || '' }); const description = ref(''); const writing = ref(false); const dialog = ref(false); const preview = ref(false)
const promptEditor = ref(null)
const { mention, update: updateMention, select: selectText } = useTextMention(promptEditor, () => draft.content)
watch(() => props.item?.id, () => { Object.assign(draft, { name: props.item?.name || '', content: props.item?.prompt || '', temperature: props.item?.temperature || '', maxTokens: props.item?.maxTokens || '' }); description.value = ''; dialog.value = false; preview.value = false })
async function write() { if (!description.value.trim()) return toast.info('请输入预设描述'); writing.value = true; try { await emit('write', draft, description.value); dialog.value = false } catch (error) { toast.error('AI 生成预设失败: ' + error.message) } finally { writing.value = false } }
watch(() => draft.content, () => nextTick(updateMention))
function renderPreview() { return DOMPurify.sanitize(marked.parse(draft.content || '')) }
</script>
<template><section class="editor-view"><div class="editor-header"><Button size="sm" @click="emit('back')"><Icon name="back" />返回</Button><span class="editor-title"><Icon name="list" />编辑预设</span><Button size="sm" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</Button><Button size="sm" @click="emit('save', draft)"><Icon name="check" />保存</Button><Button size="sm" :loading="writing" @click="dialog = true"><Icon name="robot" />AI 生成</Button></div><div class="editor-body"><input v-model="draft.name" class="editor-name" placeholder="预设名称" /><div style="display:flex;gap:8px"><input v-model="draft.temperature" class="editor-desc" placeholder="Temp" /><input v-model="draft.maxTokens" class="editor-desc" placeholder="MaxTok" /></div><div class="preset-editor-wrap"><Editor v-if="!preview" ref="promptEditor" v-model="draft.content" language="markdown" height="" placeholder="输入 @ 引用文本" /><article v-else class="markdown-preview" v-html="renderPreview()" /><div v-if="mention && !preview" class="text-mention-menu"><button v-for="text in mention.items" :key="text.name" type="button" @mousedown.prevent="selectText(text)"><strong>@{{ text.name }}</strong><span>{{ text.content.slice(0, 72) }}</span></button></div></div></div><div v-if="dialog" class="text-overlay"><div class="box"><textarea v-model="description" placeholder="描述你想要的预设" /><div class="edit-actions"><Button size="sm" @click="dialog = false">取消</Button><Button size="sm" :loading="writing" @click="write"><Icon name="check" />生成</Button></div></div></div></section></template>
