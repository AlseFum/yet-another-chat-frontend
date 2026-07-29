export class FrontendClient {
  constructor(transport) {
    if (!transport) throw new TypeError('FrontendClient 需要 transport')
    this.transport = transport
  }

  loadJobs(ids) { return this.transport.loadJobs(ids) }
  launchJob(input) { return this.transport.launchJob(input) }
  abortJob(jobId) { return this.transport.abortJob(jobId) }
  cleanJob(jobId) { return this.transport.cleanJob(jobId) }
  onJobEvent(listener) { return this.transport.onJobEvent(listener) }
  loadState() { return this.transport.loadState() }
  saveState(state) { return this.transport.saveState(state) }
  listKeys() { return this.transport.listKeys() }
  saveKey(key) { return this.transport.saveKey(key) }
  deleteKey(keyId) { return this.transport.deleteKey(keyId) }
  listStore() { return this.transport.listStore() }
  readStore(name) { return this.transport.readStore(name) }
  writeStore(name, value) { return this.transport.writeStore(name, value) }
  patchStore(name, value) { return this.transport.patchStore(name, value) }
  removeStore(name) { return this.transport.removeStore(name) }
  readAllStore() { return this.transport.readAllStore() }
  writeAllStore(value) { return this.transport.writeAllStore(value) }
}
