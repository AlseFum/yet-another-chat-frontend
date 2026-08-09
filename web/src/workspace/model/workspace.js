import { markRaw } from "vue";
import { Subject } from "rxjs";
import { BrowserJobManager } from "./job-manager.js";
import { KeyRef } from "./key-ref.js";
import { WorkspaceState } from "./state.js";
import {
  normalizeCustomSetting,
  resolveCustomSettings,
} from "./custom-settings.js";
import { ResourceCapability } from "./resource-capability.js";

export class Workspace {
  constructor({
    id,
    transport,
    temporaryKeyRef = null,
    applications = [],
  } = {}) {
    if (!id) throw new TypeError("Workspace 需要 id");
    if (!transport) throw new TypeError("Workspace 需要 transport");
    this.id = id;
    this.transport = markRaw(transport);
    this.jobsManager = markRaw(new BrowserJobManager(transport));
    this.applications = new Map(
      applications.map((application) => [application.id, application]),
    );
    this.state = new WorkspaceState();
    this.keys = [];
    this.jobs = [];
    this.keyRef = null;
    this.temporaryKey = null;
    this.error = "";
    this.customSettings = {};
    const resourceApplication = this.applications.get("resource");
    this.resources = resourceApplication
      ? markRaw(new ResourceCapability(resourceApplication))
      : null;
    this.events = markRaw(new Subject());
    this.temporaryKey = temporaryKeyRef;
    this.keyRef = temporaryKeyRef;
    this.stateWrite = Promise.resolve();
    this.jobSubscription = this.jobsManager.events.subscribe((entry) => {
      this.jobs = this.jobsManager.snapshots();
      if (entry.event?.type === "transport.error")
        this.error = entry.event.error;
      this.events.next({ type: "job", ...entry });
    });
  }

  async load() {
    const applicationKeys = [...this.applications.values()].map(
      (application) => application.stateKey || application.id,
    );
    const [state, customSettings, keys] = await Promise.all([
      this.transport.loadState({ summary: true, keys: applicationKeys }),
      this.transport.loadCustomSettings(),
      this.transport.listKeys(),
    ]);
    this.state = new WorkspaceState(state || {});
    this.customSettings = Object.fromEntries(
      [...this.applications.values()].map((application) => [
        application.id,
        resolveCustomSettings(
          application.constructor.schema?.() || {},
          customSettings?.[application.id],
        ),
      ]),
    );
    this.keys = keys;
    await this.jobsManager.load(this.state.jobIds);
    this.jobs = this.jobsManager.snapshots();
    this.revive();
    for (const application of this.applications.values()) application.init?.();
    void this.transport.connect().catch((error) => {
      this.error = error.message;
      this.events.next({ type: "transport.error", error: error.message });
    });
    this.events.next({ type: "loaded" });
    return this;
  }

  getCustomSettings(applicationId) {
    return this.customSettings[applicationId] || {};
  }

  async updateCustomSetting(applicationId, name, value) {
    const application = this.applications.get(applicationId);
    const schema = application?.constructor.schema?.() || {};
    if (!application || !schema[name])
      throw new Error(`未知 customSetting ${applicationId}.${name}`);
    const current = this.customSettings[applicationId] || {};
    current[name] = normalizeCustomSetting(schema[name], value, current[name]);
    await this.transport.patchCustomSettings({ [applicationId]: current });
    this.events.next({ type: "custom-settings", applicationId });
    return current[name];
  }

  revive() {
    this.state.reviveJobs(this.jobsManager);
    if (!this.temporaryKey) {
      const selectedKeyId = this.state.ui.selectedKeyId;
      this.keyRef =
        selectedKeyId && this.keys.some((key) => key.id === selectedKeyId)
          ? KeyRef.server(selectedKeyId)
          : null;
    }
    for (const application of this.applications.values())
      application.revive?.(this);
    return this;
  }

  saveState() {
    const snapshot = this.state.toJSON();
    this.stateWrite = this.stateWrite
      .catch(() => {})
      .then(() => this.transport.patchState(snapshot));
    return this.stateWrite;
  }

  async createKey(input) {
    const saved = await this.transport.saveKey(input);
    this.keys = await this.transport.listKeys();
    if (!this.state.ui.selectedKeyId) await this.selectKey(saved.id);
    return saved;
  }

  async deleteKey(keyId, temporary = false) {
    if (temporary) return this.clearTemporaryKey();
    await this.transport.deleteKey(keyId);
    this.keys = await this.transport.listKeys();
    if (this.state.ui.selectedKeyId === keyId)
      await this.selectKey(this.keys[0]?.id || null);
  }

  async selectKey(keyId) {
    if (keyId && !this.keys.some((key) => key.id === keyId))
      throw new Error(`找不到 Key ${keyId}`);
    this.state.ui.selectedKeyId = keyId || null;
    this.keyRef = keyId ? KeyRef.server(keyId) : null;
    await this.saveState();
  }

  useTemporaryKey(input) {
    this.temporaryKey = KeyRef.temporary(input);
    this.keyRef = this.temporaryKey;
    return this.temporaryKey;
  }

  clearTemporaryKey() {
    this.temporaryKey = null;
    const keyId = this.state.ui.selectedKeyId;
    this.keyRef = keyId ? KeyRef.server(keyId) : null;
  }

  selectedKeyRef() {
    return this.keyRef;
  }

  keyRefFor(keyId) {
    if (this.temporaryKey?.key?.id === keyId) return this.temporaryKey;
    if (this.keys.some((key) => key.id === keyId)) return KeyRef.server(keyId);
    return null;
  }
  allKeys() {
    return this.temporaryKey
      ? [...this.keys, { ...this.temporaryKey.key, temporary: true }]
      : this.keys;
  }
  jobSnapshots() {
    return this.jobs.map((job) => ({
      ...job,
      source: this.state.jobMeta[job.id]?.source,
    }));
  }

  async loadJobDetail(jobId) {
    const job = await this.jobsManager.loadDetail(jobId);
    this.jobs = this.jobsManager.snapshots();
    this.revive();
    return job ? this.jobsManager.snapshot(job) : null;
  }

  async createJob({
    request,
    keyRef = this.selectedKeyRef(),
    metadata = {},
    onEvent = null,
    onCreated = null,
  } = {}) {
    if (!keyRef) throw new Error("请先选择 API Key");
    const job = this.jobsManager.create({ request, keyRef, metadata });
    const eventSubscription = onEvent ? job.onEvent(onEvent) : null;
    // Persist the application-to-job link before a remote Job can emit output.
    await onCreated?.(job);
    const persistent = keyRef.type === "server";
    if (persistent) {
      this.state.addJob(job, metadata);
      await this.saveState();
    }
    try {
      await this.jobsManager.start(job.id);
      return job;
    } catch (error) {
      if (persistent) {
        this.state.removeJob(job.id);
        await this.saveState().catch(() => {});
      }
      eventSubscription?.unsubscribe();
      throw error;
    }
  }

  abortJob(jobId) {
    return this.jobsManager.abort(jobId);
  }

  async cleanJob(jobId) {
    await this.jobsManager.clean(jobId);
    if (this.state.jobIds.includes(jobId)) {
      this.state.removeJob(jobId);
      await this.saveState();
    }
  }

  close() {
    this.resources?.close();
    for (const application of this.applications.values()) application.close?.();
    this.jobSubscription.unsubscribe();
    this.events.complete();
    this.jobsManager.close();
    this.transport.close();
  }
}
