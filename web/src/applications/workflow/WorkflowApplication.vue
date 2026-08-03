<script setup>
import { computed, markRaw, nextTick, provide, ref, watch } from 'vue'
import { Background } from '@vue-flow/background'
import { VueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import AppIcon from '../../components/AppIcon.js'
import UiButton from '../../components/UiButton.vue'
import WorkflowNode from './ui/WorkflowNode.vue'
import { WORKFLOW_NODE_TYPES } from './workflow-application.js'

const props = defineProps({ application: Object })
const emit = defineEmits(['notify'])
provide('workflowApplication', props.application)
const nodeTypes = markRaw(Object.fromEntries(Object.keys(WORKFLOW_NODE_TYPES).map(type => [type, WorkflowNode])))
const workflow = computed(() => props.application.activeWorkflow)
const showSettings = ref(false), showLogs = ref(true), selected = ref(null), saveTimer = ref(null)
const nodes = computed({ get: () => workflow.value?.nodes || [], set: value => { if (workflow.value) workflow.value.nodes = value } })
const edges = computed({ get: () => workflow.value?.edges || [], set: value => { if (workflow.value) workflow.value.edges = value } })
watch(() => [workflow.value?.nodes, workflow.value?.edges], () => { clearTimeout(saveTimer.value); saveTimer.value = setTimeout(() => props.application.save(), 500) }, { deep: true })
const run = computed(() => workflow.value?.lastRun)
const keys = computed(() => props.application.workspace?.allKeys() || [])
async function execute() { try { await props.application.run(); emit('notify', 'Workflow 执行完成') } catch (error) { emit('notify', error.message, error.name === 'AbortError' ? 'warning' : 'danger') } }
function add(type) { const count = nodes.value.length; props.application.addNode(type, { x: 80 + (count % 3) * 260, y: 80 + Math.floor(count / 3) * 190 }); void props.application.save() }
function removeSelected() { if (!selected.value) return; props.application.removeElements(selected.value.type === 'node' ? [selected.value.id] : [], selected.value.type === 'edge' ? [selected.value.id] : []); selected.value = null; void props.application.save() }
function patchSettings() { void props.application.save() }
</script>

<template>
  <section v-if="workflow" class="workflow-view view">
    <header class="workflow-toolbar"><div class="workflow-title"><span class="workflow-mark"><AppIcon name="condition" /></span><div><input v-model="workflow.name" aria-label="Workflow 名称" @change="patchSettings" /><small>{{ workflow.nodes.length }} nodes / {{ workflow.edges.length }} edges</small></div></div><nav><UiButton v-for="(definition, type) in WORKFLOW_NODE_TYPES" :key="type" size="sm" variant="ghost" @click="add(type)"><AppIcon :name="definition.icon" size="14" />{{ definition.label }}</UiButton></nav><div class="workflow-actions"><UiButton size="sm" variant="ghost" :active="showSettings" title="运行配置" @click="showSettings = !showSettings"><AppIcon name="settings" /></UiButton><UiButton size="sm" variant="ghost" :active="showLogs" title="执行日志" @click="showLogs = !showLogs"><AppIcon name="bolt" /></UiButton><UiButton v-if="run?.status === 'running'" size="sm" variant="danger" @click="application.stop()"><AppIcon name="stop" />停止</UiButton><UiButton v-else size="sm" variant="primary" @click="execute"><AppIcon name="play" />运行</UiButton></div></header>
    <div v-if="showSettings" class="workflow-settings"><label>API Key<select v-model="workflow.api.keyRefId" @change="patchSettings"><option :value="null">请选择</option><option v-for="key in keys" :key="key.id" :value="key.id">{{ key.id }}</option></select></label><label>Model<input v-model="workflow.requestOptions.model" @change="patchSettings" /></label><label>Temperature<input v-model.number="workflow.requestOptions.temperature" type="number" min="0" max="2" step="0.1" @change="patchSettings" /></label><label>Max tokens<input v-model.number="workflow.requestOptions.maxTokens" type="number" min="1" @change="patchSettings" /></label></div>
    <main class="workflow-canvas"><VueFlow v-model:nodes="nodes" v-model:edges="edges" :node-types="nodeTypes" fit-view-on-init @connect="application.connect($event); application.save()" @node-click="selected = { type: 'node', id: $event.node.id }" @edge-click="selected = { type: 'edge', id: $event.edge.id }" @pane-click="selected = null"><Background :gap="22" /></VueFlow><UiButton v-if="selected" class="workflow-selection-delete" variant="danger" size="sm" @click="removeSelected"><AppIcon name="trash" />删除{{ selected.type === 'node' ? '节点' : '连线' }}</UiButton><aside v-if="showLogs" class="workflow-log"><header><strong>Execution trace</strong><span :class="`workflow-run-status workflow-run-status--${run?.status || 'idle'}`">{{ run?.status || 'idle' }}</span></header><div><p v-if="!run?.logs?.length">运行后会在这里显示节点级日志。</p><code v-for="(line, index) in run?.logs" :key="index">{{ line }}</code></div></aside></main>
  </section>
  <section v-else class="empty-state"><div><AppIcon name="condition" size="32" /><p>从侧边栏新建一个 Workflow。</p></div></section>
</template>
