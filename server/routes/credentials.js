import { Router } from 'express'
import { validWorkspace } from '../../util/index.js'

const resource = 'api-keys'
const publicCredential = ({ id, name, apiUrl, provider = 'openai-compatible', availModels, createdAt, isDefault = false }) => ({ id, name, apiUrl, provider, availModels: Array.isArray(availModels) ? availModels : undefined, createdAt, isDefault: Boolean(isDefault) })

export function credentialRoutes(store) {
  const router = Router()
  router.get('/:workspace/api-keys', (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    res.json(store.read(req.params.workspace, resource).map(publicCredential))
  })
  router.post('/:workspace/api-keys', async (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    const { name, apiUrl, apiKey, provider = 'openai-compatible', availModels, isDefault = false } = req.body || {}
    if (!name?.trim() || !apiUrl?.trim() || !apiKey?.trim()) return res.status(400).json({ error: '名称、服务地址和 API Key 均为必填项' })
    let url
    try { url = new URL(apiUrl) } catch { return res.status(400).json({ error: '服务地址无效' }) }
    if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).json({ error: '服务地址必须使用 HTTP 或 HTTPS' })
    const credentials = store.read(req.params.workspace, resource)
    if (availModels !== undefined && (!Array.isArray(availModels) || availModels.some(model => typeof model !== 'string' || !model.trim()))) return res.status(400).json({ error: '可用模型必须是字符串数组' })
    const makeDefault = isDefault === true || credentials.length === 0
    if (makeDefault) for (const item of credentials) item.isDefault = false
    const credential = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, name: name.trim(), apiUrl: url.toString(), apiKey: apiKey.trim(), provider, availModels: availModels?.map(model => model.trim()), isDefault: makeDefault, createdAt: new Date().toISOString() }
    credentials.push(credential)
    await store.write(req.params.workspace, resource, credentials, { immediate: true })
    res.status(201).json(publicCredential(credential))
  })
  router.patch('/:workspace/api-keys/:id/default', async (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    const credentials = store.read(req.params.workspace, resource)
    const credential = credentials.find(item => item.id === req.params.id)
    if (!credential) return res.status(404).json({ error: 'API Key 不存在' })
    for (const item of credentials) item.isDefault = item.id === credential.id
    await store.write(req.params.workspace, resource, credentials, { immediate: true })
    res.json(publicCredential(credential))
  })
  router.delete('/:workspace/api-keys/:id', async (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    const credentials = store.read(req.params.workspace, resource)
    const nextCredentials = credentials.filter(item => item.id !== req.params.id)
    if (nextCredentials.length === credentials.length) return res.status(404).json({ error: 'API Key 不存在' })
    await store.write(req.params.workspace, resource, nextCredentials, { immediate: true })
    res.json({ ok: true })
  })
  return router
}
