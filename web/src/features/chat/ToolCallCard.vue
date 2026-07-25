<script setup>
import { computed, ref } from 'vue'
import Button from '../../components/Button.vue'
import Icon from '../../components/Icon.vue'

const props = defineProps({ call: { type: Object, required: true }, result: { type: String, default: '' } })
const expanded = ref(false)
const running = computed(() => props.result === '')
const args = computed(() => JSON.stringify(props.call.args ?? {}, null, 2))
</script>

<template>
  <Button class="cot-toggle tool-toggle" :class="{ expanded }" variant="ghost" size="sm" :aria-expanded="expanded" @click.stop="expanded = !expanded">
    <Icon class="cot-chevron" name="chevron-down" size="14" />工具调用 <span class="tool-name">{{ call.name }}</span><span v-if="running" class="tool-status">运行中</span>
  </Button>
  <div v-if="expanded" class="cot tool-details">
    <section class="tool-section"><strong>参数</strong><pre>{{ args }}</pre></section>
    <template v-if="!running">
      <section class="tool-section"><strong>结果</strong><pre>{{ result }}</pre></section>
    </template>
  </div>
</template>

<style scoped>
.tool-details { display: grid; gap: 10px; }
.tool-section { display: grid; gap: 5px; }
.tool-section strong { color: var(--text-faint); font-size: 11px; font-weight: 600; }
.tool-section pre { max-height: 240px; overflow: auto; padding: 8px 10px; border-radius: 4px; background: var(--editor-gutter); font-family: var(--font-mono, monospace); font-size: 11px; white-space: pre-wrap; }
</style>
