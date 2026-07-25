<script setup>
import { ref, watch, nextTick } from 'vue'
import Editor from '../../components/Editor.vue'
import Button from '../../components/Button.vue'
import Icon from '../../components/Icon.vue'
import { useTextMention } from '../../lib/useTextMention.js'

const props = defineProps({
  loading: { type: Boolean, default: false },
  historyEditing: { type: Boolean, default: false },
})
const emit = defineEmits(['send', 'stop', 'toggle-history'])

const input = ref('')
const inputEditor = ref(null)
const { mention, update: updateMention, select: selectText } = useTextMention(inputEditor, () => input.value)

function handleSend() {
  if (props.loading || props.historyEditing) return
  if (mention.value?.items.length) {
    selectText(mention.value.items[0])
    return
  }
  const text = input.value.trim()
  if (!text) return
  emit('send', text)
  input.value = ''
}

watch(input, () => nextTick(updateMention))

function setInput(text) {
  input.value = text
  mention.value = null
  nextTick(() => {
    const view = inputEditor.value?.view
    if (!view) return
    view.focus()
    view.dispatch({ selection: { anchor: view.state.doc.length } })
  })
}

defineExpose({ setInput })
</script>

<template>
  <div id="input-bar">
    <div class="input-editor-wrap">
      <Editor
        ref="inputEditor"
        v-model="input"
        compact
        :placeholder="historyEditing ? '结束历史编辑后才能发送' : '输入消息… @ 引用'"
        :on-enter="handleSend"
        :read-only="loading || historyEditing"
      />
      <div v-if="mention" class="text-mention-menu">
        <button v-for="text in mention.items" :key="text.name" type="button" @mousedown.prevent="selectText(text)">
          <strong>@{{ text.name }}</strong>
          <span>{{ text.content.slice(0, 72) }}</span>
        </button>
      </div>
    </div>
    <div class="input-actions"><Button class="history-edit-btn" variant="ghost" size="icon" :class="{ active: historyEditing }" :disabled="loading" :title="historyEditing ? '结束历史编辑' : '编辑历史'" @click="emit('toggle-history')"><Icon name="edit" /></Button><Button v-if="loading" class="stop-btn" variant="danger" @click="emit('stop')"><Icon name="stop" />停止</Button><Button v-else class="send-btn" variant="primary" :disabled="historyEditing" title="发送" @click="handleSend"><Icon name="send-up" size="17" /></Button></div>
  </div>
</template>
