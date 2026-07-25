import { Router } from 'express'
import { validWorkspace } from '../../util/index.js'

export function llmRoutes(_store, jobs) {
  const router = Router()
  router.post('/:workspace/llm', async (req, res, next) => {
    if (!validWorkspace(req.params.workspace)) return next()
    const { credentialId, request, source } = req.body || {}
    try {
      const handle = await jobs.submit({ workspace: req.params.workspace, credentialId, request, source })
      res.status(202).json({ job: handle.job.toJSON() })
    } catch (error) { res.status(error.statusCode || 502).json({ error: `无法连接 API 服务: ${error.message}` }) }
  })
  return router
}
