<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { Decoration, EditorView, MatchDecorator, ViewPlugin } from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'markdown' },
  compact: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  highlights: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'submit'])
const host = ref(null)
let editor
let syncing = false

function highlightExtension(rules) {
  const valid = rules
    .filter(rule => rule?.enabled !== false && typeof rule.pattern === 'string' && rule.pattern.length <= 120 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(rule.className || ''))
    .slice(0, 50)
  if (!valid.length) return ViewPlugin.define(() => ({}))
  let regexp
  try {
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    regexp = new RegExp(valid.map(rule => `(${escape(rule.pattern)})`).join('|'), 'g')
  } catch { return ViewPlugin.define(() => ({})) }
  const decorator = new MatchDecorator({
    regexp,
    decoration: match => {
      const index = match.findIndex((value, index) => index > 0 && value !== undefined)
      const rule = valid[index - 1]
      const style = [
        rule.color && `--resource-highlight-color:${rule.color}`,
        rule.background && `--resource-highlight-background:${rule.background}`,
        rule.bold && '--resource-highlight-weight:700',
        rule.italic && '--resource-highlight-style:italic',
        rule.underline && '--resource-highlight-underline:underline',
        rule.strikethrough && '--resource-highlight-strike:line-through',
      ].filter(Boolean).join(';')
      return Decoration.mark({ class: `cm-resource-highlight-${rule?.className || 'default'}`, attributes: style ? { style } : undefined })
    },
  })
  return ViewPlugin.fromClass(class {
    decorations
    constructor(view) { this.decorations = decorator.createDeco(view) }
    update(update) { this.decorations = decorator.updateDeco(this.decorations, update) }
  }, { decorations: value => value.decorations })
}

onMounted(() => {
  const highlightCompartment = new Compartment()
  const language = props.language === 'javascript' ? javascript() : markdown()
  editor = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        language,
        EditorView.lineWrapping,
        highlightCompartment.of(highlightExtension(props.highlights)),
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
  editor.highlightCompartment = highlightCompartment
})

watch(() => props.modelValue, value => {
  if (!editor || value === editor.state.doc.toString()) return
  syncing = true
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  syncing = false
})

watch(() => props.highlights, () => {
  if (!editor) return
  editor.dispatch({ effects: editor.highlightCompartment.reconfigure(highlightExtension(props.highlights)) })
}, { deep: true })

onBeforeUnmount(() => editor?.destroy())
</script>

<template><div ref="host" class="code-editor" :class="{ compact }" :data-placeholder="placeholder" /></template>
