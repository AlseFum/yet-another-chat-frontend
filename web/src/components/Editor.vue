<script setup>
import { ref, onMounted, onUnmounted, watch, shallowRef, computed } from 'vue'
import { basicSetup, minimalSetup } from 'codemirror'
import { EditorView, keymap, placeholder as cmPlaceholder, Decoration } from '@codemirror/view'
import { Annotation, Compartment, EditorState, Prec } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { decorField, decorEffect, buildDecorations, injectTokenStyles } from './editor/highlightUtils.js'
import { createScanner } from './editor/highlightScanner.js'
import { toast } from './Toast.vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'text' },
  readOnly: { type: Boolean, default: false },
  height: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  onEnter: { type: Function, default: null },
  autofocus: { type: Boolean, default: false },
  fixedPrefix: { type: String, default: '' },
  fixedSuffix: { type: String, default: '' },
  highlightRules: { type: Object, default: null },
  highlightTheme: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

const editorRef = ref(null)
const view = shallowRef(null)
let syncing = false
let hlTimer = null
const editableConf = new Compartment()
const readOnlyConf = new Compartment()
const fixedContentSync = Annotation.define()

const langExt = computed(() => {
  if (props.language === 'javascript') return javascript()
  if (props.language === 'markdown') return markdown()
  return []
})

function documentText(content = props.modelValue) {
  return `${props.fixedPrefix}${content}${props.fixedSuffix}`
}

function editableContent(doc) {
  const start = props.fixedPrefix.length
  const end = doc.length - props.fixedSuffix.length
  return doc.slice(start, Math.max(start, end))
}

function syncDocument() {
  const v = view.value
  const next = documentText()
  if (!v || v.state.doc.toString() === next) return
  syncing = true
  v.dispatch({
    changes: { from: 0, to: v.state.doc.length, insert: next },
    annotations: fixedContentSync.of(true),
  })
  syncing = false
}

function applyHighlights() {
  const v = view.value
  if (!v || !props.highlightRules) return
  try {
    const scanner = createScanner(props.highlightRules)
    const result = scanner(v.state.doc.toString())
    injectTokenStyles(props.highlightTheme)
    const decos = buildDecorations(result.tokens, props.highlightTheme)
    v.dispatch({ effects: decorEffect.of(decos) })
  } catch (e) {
    console.error('[applyHighlights] error:', e)
    toast.error(`应用文本高亮失败: ${e.message}`)
  }
}

function scheduleHighlights() {
  if (!props.highlightRules) return
  clearTimeout(hlTimer)
  hlTimer = setTimeout(applyHighlights, 3000)
}

onMounted(() => {
  const exts = []

  if (props.compact) {
    exts.push(minimalSetup)
  } else {
    exts.push(basicSetup)
  }

  exts.push(langExt.value)
  exts.push(EditorView.lineWrapping)
  exts.push(decorField)
  exts.push(keymap.of([indentWithTab]))
  exts.push(EditorState.transactionFilter.of(tr => {
    if (!tr.docChanged || tr.annotation(fixedContentSync)) return tr
    const editableStart = props.fixedPrefix.length
    const editableEnd = tr.startState.doc.length - props.fixedSuffix.length
    let allowed = true
    tr.changes.iterChanges((from, to) => {
      if (from < editableStart || to > editableEnd) allowed = false
    })
    return allowed ? tr : []
  }))

  if (props.placeholder) {
    exts.push(cmPlaceholder(props.placeholder))
  }

  exts.push(editableConf.of(EditorView.editable.of(!props.readOnly)))
  exts.push(readOnlyConf.of(EditorState.readOnly.of(props.readOnly)))

  if (props.onEnter) {
    exts.push(Prec.highest(keymap.of([{
      key: 'Enter',
      run: () => { props.onEnter(); return true },
    }])))
  }

  exts.push(EditorView.updateListener.of(update => {
    if (update.docChanged) {
      if (!syncing) emit('update:modelValue', editableContent(update.state.doc.toString()))
      scheduleHighlights()
    }
  }))

  view.value = new EditorView({
    state: EditorState.create({ doc: documentText(), extensions: exts }),
    parent: editorRef.value,
  })

  if (props.autofocus) {
    requestAnimationFrame(() => {
      const v = view.value
      if (v) { v.focus(); v.dispatch({ selection: { anchor: v.state.doc.length } }) }
    })
  }

  if (props.highlightRules) applyHighlights()
})

watch(() => props.modelValue, syncDocument)

watch([() => props.fixedPrefix, () => props.fixedSuffix], syncDocument)

watch(() => props.readOnly, (val) => {
  view.value?.dispatch({
    effects: [
      editableConf.reconfigure(EditorView.editable.of(!val)),
      readOnlyConf.reconfigure(EditorState.readOnly.of(val)),
    ],
  })
})

watch(() => props.highlightRules, (rules) => {
  if (rules) applyHighlights()
  else {
    clearTimeout(hlTimer)
    view.value?.dispatch({ effects: decorEffect.of(Decoration.none) })
  }
})

watch(() => props.highlightTheme, () => {
  if (props.highlightRules) applyHighlights()
}, { deep: true })

onUnmounted(() => {
  clearTimeout(hlTimer)
  view.value?.destroy()
})

defineExpose({ view })
</script>

<template>
  <div ref="editorRef" class="editor" :class="{ compact: compact }" :style="{ height: height || undefined }" />
</template>
