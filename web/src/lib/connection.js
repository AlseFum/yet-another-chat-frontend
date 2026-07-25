import { reactive } from 'vue'

const empty = () => ({ mode: 'proxy', provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' })

function decode(value) {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
    return JSON.parse(decodeURIComponent(escape(atob(padded))))
  } catch { return null }
}

function encode(value) {
  const bytes = unescape(encodeURIComponent(JSON.stringify(value)))
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function readFragmentConnection() {
  const value = new URLSearchParams(location.hash.slice(1)).get('llm')
  const connection = value && decode(value)
  return connection?.mode === 'direct' && connection.apiKey && connection.baseUrl ? connection : null
}

export function writeFragmentConnection(connection) {
  const payload = { v: 1, mode: 'direct', provider: connection.provider || 'openai-compatible', baseUrl: connection.baseUrl, apiKey: connection.apiKey, model: connection.model || '' }
  history.replaceState(null, '', `${location.pathname}${location.search}#llm=${encode(payload)}`)
}

export function clearFragmentConnection() {
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}

export function createConnectionState() {
  return reactive({ ...empty(), ...(readFragmentConnection() || {}) })
}
