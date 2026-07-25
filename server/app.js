import express from 'express'
import { credentialRoutes } from './routes/credentials.js'
import { llmRoutes } from './routes/llm.js'
import { resourceRoutes } from './routes/resources.js'

export function createApp(store, jobs) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use('/api', credentialRoutes(store))
  app.use('/api', llmRoutes(store, jobs))
  app.use('/api', resourceRoutes(store))
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API 路径不存在' }))
  return app
}
