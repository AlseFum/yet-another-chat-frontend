import { nanoid } from 'nanoid'

export class Application {
  constructor({ id = nanoid(), jobs = [] } = {}) {
    this.id = id
    this.jobs = [...new Set(jobs)]
  }

  addJob(jobId) {
    if (!this.jobs.includes(jobId)) this.jobs.push(jobId)
    return jobId
  }

  removeJob(jobId) {
    this.jobs = this.jobs.filter(id => id !== jobId)
  }

  toJSON() {
    return { id: this.id, jobs: [...this.jobs] }
  }
}
