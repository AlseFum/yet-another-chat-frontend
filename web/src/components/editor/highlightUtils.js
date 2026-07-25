import { EditorView, Decoration } from '@codemirror/view'
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'

export const PALETTE = [
  '#c678dd', '#61afef', '#e06c75', '#98c379',
  '#d19a66', '#56b6c2', '#e5c07b', '#be5046',
  '#c0c8d4', '#7f848e', '#5d9f6e', '#d4789c',
]

export const decorEffect = StateEffect.define()

export const decorField = StateField.define({
  create() { return Decoration.none },
  update(value, tr) {
    for (const e of tr.effects) if (e.is(decorEffect)) return e.value
    return value.map(tr.changes)
  },
  provide: f => EditorView.decorations.from(f),
})

export function buildDecorations(tokens, theme) {
  if (!tokens.length) return Decoration.none
  const builder = new RangeSetBuilder()
  for (const t of tokens) {
    const v = theme[t.name]
    const hasColor = v && ((typeof v === 'string') || v.color)
    const cls = hasColor ? `cm-token-${t.name}` : 'cm-token-default'
    builder.add(t.from, t.to, Decoration.mark({ class: cls }))
  }
  return builder.finish()
}

export function injectTokenStyles(theme) {
  let el = document.getElementById('hl-token-styles')
  if (el) el.remove()
  el = document.createElement('style')
  el.id = 'hl-token-styles'
  document.head.appendChild(el)
  let css = ''
  for (const [name, raw] of Object.entries(theme)) {
    const s = typeof raw === 'string' ? { color: raw } : (raw || {})
    if (!s.color && name === 'default') s.color = '#c0c8d4'
    if (!s.color) continue
    const cls = name === 'default' ? 'cm-token-default' : `cm-token-${name}`
    const rules = [`color:${s.color} !important`]
    if (s.bold) rules.push('font-weight:bold !important')
    if (s.italic) rules.push('font-style:italic !important')
    if (s.underline) rules.push('text-decoration:underline !important')
    if (s.strike) rules.push('text-decoration:line-through !important')
    if (s.bg) rules.push(`background-color:${s.bg} !important`)
    css += `.${cls} { ${rules.join('; ')} }\n`
  }
  el.textContent = css
}

export function assignColors(theme, tokenNames) {
  const t = { ...theme }
  if (!t.default) t.default = { color: '#c0c8d4' }
  tokenNames.forEach((name, i) => {
    if (name !== 'default' && !(name in t)) {
      t[name] = { color: PALETTE[i % PALETTE.length] }
    }
  })
  return t
}

export function extractJSON(text) {
  let cleaned = text.trim()
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, '')
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '')
  cleaned = cleaned.replace(/\s*```$/, '')
  cleaned = cleaned.trim()

  function tryParse(str) {
    let fixed = str
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1')
    try { return JSON.parse(fixed) } catch (_) {}
    for (let i = 1; i <= 5; i++) {
      try { return JSON.parse(fixed + '}'.repeat(i)) } catch (_) {}
    }
    for (let i = 1; i <= 3; i++) {
      for (let j = 1; j <= 3; j++) {
        try { return JSON.parse(fixed + ']'.repeat(i) + '}'.repeat(j)) } catch (_) {}
        try { return JSON.parse(fixed + '}'.repeat(i) + ']'.repeat(j)) } catch (_) {}
      }
    }
    return null
  }

  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const r = tryParse(cleaned.slice(first, last + 1))
    if (r) return r
  }

  const typeIdx = cleaned.lastIndexOf('{"type"')
  if (typeIdx >= 0) {
    const sub = cleaned.substring(typeIdx)
    let depth = 0, end = -1
    for (let i = 0; i < sub.length; i++) {
      if (sub[i] === '{') depth++
      else if (sub[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end > 0) {
      const r = tryParse(sub.substring(0, end + 1))
      if (r) return r
    }
  }

  const lines = cleaned.split('\n').filter(l => {
    const t = l.trim()
    return t.startsWith('{') && (t.includes('"scopes"') || t.includes('"type"'))
  })
  for (let i = lines.length - 1; i >= 0; i--) {
    const r = tryParse(lines[i].trim())
    if (r) return r
  }

  const preview = cleaned.length > 500 ? cleaned.slice(0, 500) + '...' : cleaned
  throw new Error(`无法解析 AI 返回的 JSON。原始响应: ${preview}`)
}
