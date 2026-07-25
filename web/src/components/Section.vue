<script setup>
import SectionHeader from './SectionHeader.vue'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  open: { type: Boolean, default: true },
  collapsible: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  separated: { type: Boolean, default: false },
  contentMaxHeight: { type: String, default: '' },
  contentMinHeight: { type: String, default: '' },
  contentPadding: { type: String, default: '' },
})
const emit = defineEmits(['update:open'])

function toggle() {
  if (props.collapsible) emit('update:open', !props.open)
}
</script>

<template>
  <section class="section">
    <SectionHeader :title="title" :icon="icon" :compact="compact" :border-top="separated" :open="open" :collapsible="collapsible" @activate="toggle">
      <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    </SectionHeader>
    <div
      v-show="open"
      class="section-content"
      :class="{ scrollable: contentMaxHeight }"
      :style="{ minHeight: contentMinHeight || undefined, maxHeight: contentMaxHeight || undefined, padding: contentPadding || undefined }"
    ><slot /></div>
  </section>
</template>

<style scoped>
.section-content.scrollable { overflow-y: auto; }
</style>
