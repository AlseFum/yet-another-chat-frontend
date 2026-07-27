import { Provider } from './provider.js'
import { nanoid } from 'nanoid'

export class LLMKey {
  constructor({ id = nanoid(), apiKey, provider = 'openai-compatible', baseUrl } = {}) {
    if (!apiKey) throw new TypeError('LLMKey 需要 apiKey')
      
    const adapter = Provider.get(provider)
    this.id = id
    this.apiKey = apiKey
    this.provider = adapter.id
    this.baseUrl = baseUrl || adapter.defaultBaseUrl
  }

  static from(value) { return value instanceof LLMKey ? value : new LLMKey(value) }
}
