import { ref } from 'vue'
import { useWorkspace } from './contexts.js'

export function useTextMention(editorRef, getText) {
  const workspace = useWorkspace()
  const mention = ref(null)

  function update() {
    const view = editorRef.value?.view
    if (!view) return
    const head = view.state.selection.main.head
    const before = getText().slice(0, head)
    const match = before.match(/(?:^|\s)@([^\s@[\]]*)$/)
    if (!match) { mention.value = null; return }
    const query = match[1].toLocaleLowerCase()
    const items = workspace.texts.filter(t => t.name.toLocaleLowerCase().includes(query)).slice(0, 8)
    mention.value = items.length ? { from: head - query.length - 1, to: head, items } : null
  }

  function select(text) {
    const current = mention.value
    const view = editorRef.value?.view
    if (!current || !view) return
    const insert = `@[${text.name}] `
    view.dispatch({
      changes: { from: current.from, to: current.to, insert },
      selection: { anchor: current.from + insert.length },
    })
    mention.value = null
    view.focus()
  }

  return { mention, update, select }
}
