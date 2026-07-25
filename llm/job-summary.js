// The list/sync representation deliberately excludes prompts, messages,
// attempts, and outputs. Those are retrieved only from the detail endpoint.
export function jobSummary(job = {}) {
  return {
    id: job.id,
    workspace: job.workspace,
    source: job.source || 'llm',
    status: job.status,
    mode: job.mode || 'proxy',
    provider: job.provider || job.key?.providerId || null,
    context: job.context || null,
    createdAt: job.createdAt || null,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    error: job.error || null,
    detailAvailable: true,
  }
}
