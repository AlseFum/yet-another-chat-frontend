import { Provider } from './provider.js'

/**
 * Builds provider requests after resolving credentials at the last possible
 * point. Browser and server supply different key resolvers but share provider
 * preparation and authorization behavior.
 */
export function createLLMFetch({ request = globalThis.fetch, resolveKey } = {}) {
  if (typeof request !== 'function') throw new TypeError('LLM Fetch 需要 request 函数')
  // --- Provider request pipeline ---

  return async ({ key, job, signal }) => {
    if (typeof resolveKey !== 'function') throw new Error('LLM Fetch 无法解析密钥')
    const secret = await resolveKey(key)
    if (!secret) throw new Error('找不到 API Key')
    // Adapters normalize request shape and attach provider-specific auth.
    const provider = Provider.get(key.provider || key.providerId)
    const prepared = provider.prepare(key, job)
    const requestOptions = provider.authorize(prepared, secret)
    const response = await request(requestOptions.url, { ...requestOptions.init, signal })
    return { response, prepared }
  }
}
