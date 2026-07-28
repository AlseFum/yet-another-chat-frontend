<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'markdown' },
  compact: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'submit'])
const host = ref(null)
let editor
let syncing = false

onMounted(() => {
  const language = props.language === 'javascript' ? javascript() : markdown()
  editor = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        language,
        EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (update.docChanged && !syncing) emit('update:modelValue', update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          keydown(event) {
            if (props.compact && event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              emit('submit')
              return true
            }
            return false
          },
        }),
      ],
    }),
  })
})

watch(() => props.modelValue, value => {
  if (!editor || value === editor.state.doc.toString()) return
  syncing = true
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  syncing = false
})

onBeforeUnmount(() => editor?.destroy())
</script>

<template><div ref="host" class="code-editor" :class="{ compact }" :data-placeholder="placeholder" /></template>
