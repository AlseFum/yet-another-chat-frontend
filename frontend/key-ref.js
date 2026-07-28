import { nanoid } from 'nanoid'
import { LLMKey } from '../llm/index.js'

export class KeyRef {
  constructor({ id = nanoid(), type, key = null, keyId = null } = {}) {
    if (type === 'temporary') {
      this.key = LLMKey.from(key)
      this.type = type
      this.id = id
      return
    }
    if (type === 'server' && keyId) {
      this.type = type
      this.id = id
      this.keyId = keyId
      return
    }
    throw new TypeError('KeyRef 需要 temporary LLMKey 或 server keyId')
  }

  static temporary(key) { return new KeyRef({ type: 'temporary', key }) }
  static server(keyId) { return new KeyRef({ type: 'server', keyId }) }

  toJSON() {
    if (this.type === 'temporary') return { id: this.id, type: this.type }
    return { id: this.id, type: this.type, keyId: this.keyId }
  }
}
