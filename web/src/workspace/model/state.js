export class WorkspaceState {
  constructor({ jobs = [], jobMeta = {}, ui = {}, ...data } = {}) {
    this.jobIds = [...new Set(Array.isArray(jobs) ? jobs.map(job => typeof job === 'object' ? job.id : job).filter(Boolean) : [])]
    this.jobs = []
    this.jobMeta = { ...jobMeta }
    this.ui = {
      selectedKeyId: ui.selectedKeyId || null,
    }
    this.data = { ...data }
  }

  reviveJobs(jobManager) {
    this.jobs = this.jobIds.map(id => jobManager.get(id)).filter(Boolean)
    return this.jobs
  }

  addJob(job, meta = {}) {
    if (!job?.id) throw new TypeError('WorkspaceState.addJob 需要 Job')
    if (!this.jobs.some(item => item.id === job.id)) this.jobs.push(job)
    if (!this.jobIds.includes(job.id)) this.jobIds.push(job.id)
    this.jobMeta[job.id] = { ...this.jobMeta[job.id], ...meta }
    return job
  }

  removeJob(jobId) {
    this.jobs = this.jobs.filter(job => job.id !== jobId)
    this.jobIds = this.jobIds.filter(id => id !== jobId)
    delete this.jobMeta[jobId]
  }

  setUi(patch) { Object.assign(this.ui, patch) }
  get(key, fallback = undefined) { return Object.hasOwn(this.data, key) ? this.data[key] : fallback }
  set(key, value) { this.data[key] = value }

  toJSON() {
    return { ...this.data, jobs: [...this.jobIds], jobMeta: { ...this.jobMeta }, ui: { ...this.ui } }
  }
}
