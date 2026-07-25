<script setup>
import { computed, reactive, ref, watch } from 'vue'
import Editor from '../components/Editor.vue'; import Button from '../components/Button.vue'; import Icon from '../components/Icon.vue'
import { toast } from '../components/Toast.vue'
const props = defineProps({ item: Object }); const emit = defineEmits(['back', 'save', 'write']); const draft = reactive({ name: props.item?.name || '', desc: props.item?.desc || '', code: props.item?.code || '', aiWriting: false }); const cheatsheet = ref(false)
const toolPrefix = computed(() => `async function ${draft.name || 'toolName'}(ctx) {\n`)
const toolSuffix = '\n}'
watch(() => props.item?.name, () => { Object.assign(draft, { name: props.item?.name || '', desc: props.item?.desc || '', code: props.item?.code || '', aiWriting: false }); cheatsheet.value = false })
async function write() { try { await emit('write', draft) } catch (error) { toast.error('AI 写工具失败: ' + error.message) } }
</script>
<template><section class="editor-view"><div class="editor-header"><Button size="sm" @click="emit('back')"><Icon name="back" />返回</Button><span class="editor-title"><Icon name="tool" />编辑工具</span><Button size="sm" @click="emit('save', draft)"><Icon name="check" />保存</Button><Button size="sm" :loading="draft.aiWriting" @click="write"><Icon name="robot" />AI 写</Button></div><div class="editor-body"><input v-model="draft.name" class="editor-name" placeholder="工具名称" /><input v-model="draft.desc" class="editor-desc" placeholder="功能描述（AI 会看到）" /><Editor v-model="draft.code" language="javascript" :height="cheatsheet ? '' : '200px'" :fixed-prefix="toolPrefix" :fixed-suffix="toolSuffix" /><div class="cheatsheet-toggle"><Button size="sm" @click="cheatsheet = !cheatsheet"><Icon :name="cheatsheet ? 'close' : 'book'" />{{ cheatsheet ? '关闭指引' : '查看指引' }}</Button></div><div v-if="cheatsheet" class="cheatsheet"><pre>可用变量 ctx.args / ctx.fetch / ctx.texts / ctx.conv</pre></div></div></section></template>
