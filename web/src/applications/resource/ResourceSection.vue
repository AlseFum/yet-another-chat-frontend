<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../../components/AppIcon.js'

const props = defineProps({ application: Object, active: Boolean })
const emit = defineEmits(['navigate', 'notify'])
const open = ref(true)
const items = [
  { id: 'text', label: '文本', icon: 'file' },
  { id: 'preset', label: '预设', icon: 'preset' },
  { id: 'tool', label: '工具', icon: 'tool' },
]
const resourceCount = computed(() => items.reduce((total, item) => total + (props.application[item.id]?.length || 0), 0))

async function select(type) {
  try {
    await props.application.select(type)
    emit('navigate', 'resource')
  } catch (error) {
    emit('notify', error.message, 'danger')
  }
}
</script>

<template>
  <section class="side-section resource-section">
    <header @click="open = !open"><AppIcon name="file" /><span>资源</span><span class="section-count">{{ resourceCount }}</span><AppIcon class="section-chevron" name="chevron" size="12" /></header>
    <div v-show="open" class="resource-nav">
      <button v-for="item in items" :key="item.id" :class="{ active: active && application.activeType === item.id }" @click="select(item.id)"><AppIcon :name="item.icon" />{{ item.label }}<span>{{ application[item.id].length }}</span></button>
    </div>
  </section>
</template>
