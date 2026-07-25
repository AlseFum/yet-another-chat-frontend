import { Router } from 'express'
import { validWorkspace } from '../../util/index.js'
import { jobSummary } from '../../llm/job-summary.js'

const readableResources = new Set(['convs', 'talks', 'texts', 'tools', 'presets', 'workflows', 'llm-jobs'])
const writableResources = new Set(['convs', 'talks', 'texts', 'tools', 'presets', 'workflows'])
const transferableResources = ['convs', 'talks', 'texts', 'tools', 'presets', 'workflows']

export function resourceRoutes(store) {
  const router = Router()
  router.get('/:workspace/export', (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    res.json({ version: 1, exportedAt: new Date().toISOString(), workspace: req.params.workspace, resources: Object.fromEntries(transferableResources.map(resource => [resource, store.read(req.params.workspace, resource)])) })
  })
  router.post('/:workspace/import', async (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    const resources = req.body?.resources
    if (!resources || typeof resources !== 'object') return res.status(400).json({ error: '导入文件缺少 resources' })
    for (const resource of transferableResources) if (resources[resource] !== undefined && !Array.isArray(resources[resource])) return res.status(400).json({ error: `${resource} 必须是数组` })
    await Promise.all(transferableResources.map(resource => store.write(req.params.workspace, resource, Array.isArray(resources[resource]) ? resources[resource] : [], { immediate: true })))
    res.json({ ok: true, resources: transferableResources })
  })
  router.get('/:workspace/llm-jobs/:id', (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    const job = store.read(req.params.workspace, 'llm-jobs').find(item => item.id === req.params.id)
    if (!job) return res.status(404).json({ error: 'LLM 任务不存在' })
    res.json(job)
  })
  router.get('/:workspace/:resource', (req, res, next) => {
    if (!readableResources.has(req.params.resource) || !validWorkspace(req.params.workspace)) return next()
    const value = store.read(req.params.workspace, req.params.resource)
    res.json(req.params.resource === 'llm-jobs' ? value.map(jobSummary) : value)
  })
  router.put('/:workspace/:resource', async (req, res, next) => {
    if (!writableResources.has(req.params.resource) || !validWorkspace(req.params.workspace)) return next()
    if (!Array.isArray(req.body)) return res.status(400).json({ error: '资源必须为数组' })
    await store.write(req.params.workspace, req.params.resource, req.body)
    res.json({ ok: true })
  })
  return router
}
