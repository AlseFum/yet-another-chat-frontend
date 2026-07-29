import { LLMKey } from '../../../../llm/index.js'

export class KeyRef {
  constructor({ type, keyId, key } = {}) {
    if (type === 'server' && keyId) {
      this.type = type
      this.keyId = keyId
      return
    }
    if (type === 'temporary' && key) {
      this.type = type
      this.key = LLMKey.from(key)
      return
    }
    throw new TypeError('KeyRef 需要 server keyId 或 temporary key')
  }

  static server(keyId) { return new KeyRef({ type: 'server', keyId }) }
  static temporary(key) { return new KeyRef({ type: 'temporary', key }) }

  static fromHash(hash = globalThis.location?.hash || '') {
    const encoded = new URLSearchParams(hash.replace(/^#/, '')).get('llm')
    if (!encoded) return null
    try {
      const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4)
      const value = JSON.parse(decodeURIComponent(escape(atob(padded))))
      if (value?.mode !== 'direct' || !value.apiKey || !value.baseUrl) return null
      return KeyRef.temporary({ id: value.id || 'fragment', apiKey: value.apiKey, provider: value.provider, baseUrl: value.baseUrl })
    } catch { return null }
  }

  toJSON() {
    if (this.type === 'temporary') return { type: this.type, keyId: this.key.id }
    return { type: this.type, keyId: this.keyId }
  }
}
