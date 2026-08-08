<script setup>
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.js'
import UiButton from '../../components/UiButton.vue'
const props = defineProps({ application: Object, active: Boolean }); const emit = defineEmits(['navigate', 'notify']); const open = ref(true)
async function create() { const item = props.application.create(); await props.application.save(); emit('navigate', 'workflow'); emit('notify', `已创建 ${item.name}`) }
async function select(id) { await props.application.select(id); emit('navigate', 'workflow') }
async function remove(id) { if (!confirm('删除这个 Workflow？')) return; await props.application.remove(id) }
</script>
<template><section class="side-section"><header><button type="button" class="side-section__toggle" :aria-expanded="open" @click="open = !open"><AppIcon name="condition" /><span>Workflow</span><AppIcon class="section-chevron" :class="{ 'section-chevron--open': open }" name="chevron" size="12" /></button><UiButton variant="ghost" size="icon" title="新建 Workflow" @click="create"><AppIcon name="plus" size="14" /></UiButton></header><div v-show="open" class="side-list"><div v-for="item in application.workflows" :key="item.id" class="conversation-entry" :class="{ active: active && application.ui.activeWorkflowId === item.id }"><button @click="select(item.id)"><span>{{ item.name }}</span></button><UiButton variant="ghost" size="icon" title="删除 Workflow" @click="remove(item.id)"><AppIcon name="trash" size="14" /></UiButton></div><p v-if="!application.workflows.length" class="side-list__empty">还没有 Workflow</p></div></section></template>
