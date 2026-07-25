import { Provider } from './provider.js'

/**
 * Execution location and non-secret provider configuration.
 * API keys remain either local-only (keyBody) or server-resolved (keyId).
 */

// --- Configuration model ---

// ApiConfig intentionally has either keyId (server proxy) or keyBody (direct),
// never both. It is the sole place where execution locality is decided.
export class ApiConfig {
  constructor({ keyId = null, keyBody = null, provider = 'openai-compatible', path, availModels, workspace = null } = {}) {
    if (keyId && keyBody) throw new Error('ApiConfig 不能同时包含 keyId 和 keyBody')
    const adapter = Provider.get(provider)
    this.keyId = keyId
    this.keyBody = keyBody
    this.provider = adapter.id
    this.path = path || adapter.defaultBaseUrl
    this.availModels = [...(availModels || adapter.defaultModels)]
    this.workspace = workspace
  }

  // --- Derived execution settings ---

  get mode() { return this.keyBody ? 'direct' : 'proxy' }

  assertModel(model) {
    if (this.availModels.length && model && !this.availModels.includes(model)) throw new Error(`模型 ${model} 不在当前 API 配置的可用列表中`)
  }

  // --- Safe serialization and factories ---

  toJSON() { return { keyId: this.keyId, provider: this.provider, path: this.path, availModels: this.availModels } }

  static fromCredential(credential, workspace = null) {
    return new ApiConfig({ keyId: credential.id, provider: credential.provider, path: credential.apiUrl, availModels: credential.availModels, workspace })
  }

  static fromDirect(config) {
    return new ApiConfig({ keyBody: config.keyBody || config.apiKey, provider: config.provider, path: config.path || config.baseUrl, availModels: config.availModels })
  }
}
