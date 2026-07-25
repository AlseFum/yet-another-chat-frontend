<script setup>
import { ref } from 'vue'
import Button from '../components/Button.vue'
import DateTime from '../components/DateTime.vue'
import Icon from '../components/Icon.vue'
import JsonCodeBlock from '../components/JsonCodeBlock.vue'
import { apiGet } from '../lib/api.js'

const props = defineProps({ jobs: { type: Array, default: () => [] } })
const emit = defineEmits(['back'])
const selectedId = ref(null)
const selected = ref(null)
const loadingDetail = ref(false)
const details = new Map()

async function selectJob(job) {
  const id = job.serverJobId || job.id
  selectedId.value = id
  if (details.has(id)) { selected.value = details.get(id); return }
  // Browser-direct jobs have no server-side record; their local snapshot is
  // already the only available detail representation.
  if (job.mode === 'direct') { selected.value = job; return }
  loadingDetail.value = true
  selected.value = null
  const detail = await apiGet(`llm-jobs/${encodeURIComponent(id)}`)
  loadingDetail.value = false
  if (detail?.id) {
    details.set(id, detail)
    selected.value = detail
  }
}

function location(job) { return job.mode === 'direct' ? '浏览器直连' : '服务端托管' }
function params(job) {
  const input = job.input || job.request?.body || job.request || {}
  return Object.entries(input).filter(([key]) => key !== 'messages').map(([key, value]) => ({ key, value: typeof value === 'object' ? '已配置' : String(value) }))
}
function messages(job) { return job.input?.messages || job.request?.body?.messages || job.request?.messages || [] }
function attemptMessages(attempt) { return attempt.input?.messages || [] }
function validator(job) { return job.request?.validator || null }
function retrier(job) { return job.request?.retrier || null }
function capabilityList(attempt) { return Object.entries(attempt.capabilities || {}).filter(([, value]) => value).map(([key]) => key) }
</script>

<template>
  <main class="jobs-view">
    <header class="jobs-header">
      <div><p>LLM JOBS</p><h1>任务观察</h1><span>查看任务请求、实时状态、输出与错误。API Key 不会显示。</span></div>
      <Button size="sm" @click="emit('back')">返回</Button>
    </header>
    <div class="jobs-layout">
      <section class="job-list">
        <button v-for="job in jobs" :key="job.id" :class="{ active: selectedId === (job.serverJobId || job.id) }" @click="selectJob(job)">
          <strong>{{ job.source || 'llm' }}</strong>
          <span :class="`status ${job.status}`">{{ job.status }}</span>
          <small>{{ location(job) }} · {{ job.provider || job.key?.providerId || job.request?.provider || 'unknown' }}</small>
          <time>{{ new Date(job.createdAt).toLocaleString('zh-CN') }}</time>
        </button>
        <p v-if="!jobs.length" class="empty">尚无 LLM 任务</p>
      </section>
      <section v-if="selected" class="job-detail">
        <header><div><h2>{{ selected.source || 'llm' }}</h2><code>{{ selected.serverJobId || selected.id }}</code><div class="job-meta"><span><Icon :name="selected.mode === 'direct' ? 'bolt' : 'server'" size="12" />{{ location(selected) }}</span><span title="创建"><Icon name="calendar" size="12" /><DateTime :value="selected.createdAt" /></span><span title="开始"><Icon name="play" size="12" /><DateTime :value="selected.startedAt" /></span><span title="结束"><Icon name="check" size="12" /><DateTime :value="selected.completedAt" /></span></div></div><span :class="`status ${selected.status}`">{{ selected.status }}</span></header>
        <h3>请求参数</h3><dl v-if="params(selected).length" class="params"><template v-for="item in params(selected)" :key="item.key"><dt>{{ item.key }}</dt><dd>{{ item.value }}</dd></template></dl><p v-else class="param-empty">empty</p>
        <h3 v-if="messages(selected).length">消息</h3><div v-if="messages(selected).length" class="messages"><article v-for="(message, index) in messages(selected)" :key="index"><JsonCodeBlock collapsible :open="message.role !== 'system'" :label="message.role" :caption="message.role === 'system' ? '系统提示词' : '用户提示词'" :text="message.content" /></article></div>
        <details v-if="validator(selected) || retrier(selected)" class="job-details-fold"><summary>校验与重试</summary><dl class="params"><dt v-if="validator(selected)">校验器</dt><dd v-if="validator(selected)">{{ validator(selected).type || 'custom' }}</dd><dt v-if="retrier(selected)">重试器</dt><dd v-if="retrier(selected)">{{ retrier(selected).type || 'custom' }} · 最多 {{ retrier(selected).maxRetries || 0 }} 次</dd></dl></details>
        <section v-if="selected.attempts?.length" class="provider-execution"><h3>Provider 执行</h3><div class="attempts"><details v-for="(attempt, index) in selected.attempts" :key="index" class="attempt"><summary><strong>Attempt {{ index + 1 }}</strong><time>{{ attempt.requestedAt ? new Date(attempt.requestedAt).toLocaleString('zh-CN') : '' }}</time></summary><div v-if="capabilityList(attempt).length" class="capabilities"><span v-for="capability in capabilityList(attempt)" :key="capability">{{ capability }}</span></div><dl v-if="params({ input: attempt.input }).length" class="params"><template v-for="item in params({ input: attempt.input })" :key="item.key"><dt>{{ item.key }}</dt><dd>{{ item.value }}</dd></template></dl><p v-else class="param-empty">empty</p><h4 v-if="attemptMessages(attempt).length">请求消息</h4><div v-if="attemptMessages(attempt).length" class="messages"><article v-for="(message, messageIndex) in attemptMessages(attempt)" :key="messageIndex"><JsonCodeBlock collapsible :open="message.role !== 'system'" :label="message.role" :caption="message.role === 'system' ? '系统提示词' : '用户提示词'" :text="message.content" /></article></div><h4 v-if="attempt.validationErrors?.length">校验错误</h4><pre v-if="attempt.validationErrors?.length" class="attempt-error">{{ attempt.validationErrors.join('\n') }}</pre><h4 v-if="attempt.responseText">原始输出</h4><JsonCodeBlock v-if="attempt.responseText" :text="attempt.responseText" /><p v-if="attempt.error" class="attempt-error">{{ attempt.error }}</p></details></div></section>
        <h3 v-if="selected.responseText">输出</h3><pre v-if="selected.responseText">{{ selected.responseText }}</pre>
      </section>
       <section v-else class="job-detail empty">{{ loadingDetail ? '正在加载任务详情…' : '选择一个任务查看详情' }}</section>
    </div>
  </main>
</template>

<style scoped>
.jobs-view { flex: 1; min-height: 0; overflow: auto; padding: 28px clamp(16px, 4vw, 48px); }
.jobs-header, .job-detail header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.jobs-header { margin-bottom: 22px; }.jobs-header p { margin: 0 0 4px; color: var(--accent2); font-size: 10px; font-weight: 700; letter-spacing: .14em; }.jobs-header h1 { margin: 0; font-size: 24px; }.jobs-header span, small, time { color: var(--text-faint); font-size: 12px; }
.jobs-layout { display: grid; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); min-height: 520px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }.job-list { background: var(--glass-panel); border-right: 1px solid var(--border); overflow: auto; }.job-list button { display: grid; grid-template-columns: 1fr auto; gap: 5px 9px; width: 100%; padding: 12px 14px; border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); text-align: left; cursor: pointer; }.job-list button:hover, .job-list button.active { background: var(--glass-msg-assist); }.job-list small, .job-list time { grid-column: 1 / -1; }
  .job-detail { padding: 20px; overflow: auto; }.job-detail h2 { margin: 0 0 4px; font-size: 17px; }.job-detail h3 { margin: 22px 0 7px; font-size: 12px; color: var(--text-dim); }.job-detail h4 { margin: 10px 10px 5px; color: var(--text-faint); font-size: 11px; }.job-detail code { color: var(--text-faint); font-size: 11px; } dl { display: grid; grid-template-columns: 70px 1fr; gap: 7px 12px; margin: 20px 0; font-size: 12px; } dt { color: var(--text-faint); } dd { margin: 0; } pre { max-height: 330px; overflow: auto; margin: 0; padding: 12px; border-radius: 5px; background: var(--input-bg); color: var(--text-dim); white-space: pre-wrap; word-break: break-word; font-size: 11px; }.params { grid-template-columns: 120px 1fr; margin: 8px 0; padding: 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--glass-msg-assist); }.messages, .attempts { display: grid; gap: 8px; }.messages article, .attempts article { overflow: hidden; border: 1px solid var(--border); border-radius: 5px; }.messages article header, .attempts article header { display: flex; justify-content: space-between; padding: 7px 10px; background: var(--glass-msg-assist); color: var(--text-dim); font-size: 11px; }.messages pre { border-radius: 0; background: transparent; }.capabilities { display: flex; gap: 5px; flex-wrap: wrap; padding: 8px 10px 0; }.capabilities span { padding: 2px 6px; border-radius: 3px; background: rgba(16,185,129,.12); color: var(--accent2); font-size: 10px; }.attempts .params, .attempts > article > pre, .attempts > article > p { margin: 8px 10px 10px; }.attempt-error { color: var(--accent) !important; }.status { align-self: start; padding: 2px 6px; border-radius: 3px; background: rgba(148,163,184,.14); color: var(--text-dim); font-size: 10px; }.status.running, .status.streaming, .status.validating { color: var(--accent2); background: rgba(16,185,129,.12); }.status.failed, .status.cancelled { color: var(--accent); background: rgba(244,63,94,.12); }.empty { display: grid; place-items: center; min-height: 160px; color: var(--text-faint); }
@media (max-width: 760px) { .jobs-view { padding: 16px; }.jobs-layout { grid-template-columns: 1fr; }.job-list { max-height: 260px; border-right: 0; border-bottom: 1px solid var(--border); } }

.param-empty { margin: 8px 0; padding: 10px; border: 1px dashed var(--border); border-radius: 5px; color: var(--text-faint); font: 12px ui-monospace, monospace; }
.job-detail code, .job-detail dd { overflow-wrap: anywhere; }
.job-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; color: var(--text-faint); font-size: 11px; }.job-meta span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }.job-meta .icon { opacity: .7; }
.job-details-fold { margin-top: 18px; }.job-details-fold > summary, .attempt > summary { display: flex; align-items: center; gap: 10px; min-height: 34px; cursor: pointer; color: var(--text-dim); font-size: 12px; }.job-details-fold > summary { font-weight: 600; }.job-details-fold > summary::-webkit-details-marker, .attempt > summary::-webkit-details-marker { display: none; }.job-details-fold > summary::marker, .attempt > summary::marker { content: ''; }.job-details-fold > summary::after, .attempt > summary::after { content: '+'; display: grid; width: 16px; height: 16px; flex: 0 0 16px; place-items: center; border: 1px solid var(--border); border-radius: 3px; color: var(--text-faint); font: 14px/1 ui-monospace, monospace; }.job-details-fold[open] > summary::after, .attempt[open] > summary::after { content: '-'; color: var(--text); }.job-details-fold[open] > summary { color: var(--text); }.attempt { overflow: hidden; border: 1px solid var(--border); border-radius: 5px; }.attempt > summary { padding: 7px 10px; background: var(--glass-msg-assist); }.attempt > summary time { margin-left: auto; }.attempt > .params, .attempt > pre, .attempt > p, .attempt > .json-code-block { margin: 8px 10px 10px; }.attempt > .messages, .attempt > h4 { margin-left: 10px; margin-right: 10px; }

@media (max-width: 760px) {
  .jobs-view { padding: 14px 12px; }
  .jobs-header { margin-bottom: 14px; }
  .jobs-header h1 { font-size: 20px; }
  .jobs-header span { display: none; }
  .jobs-layout { min-height: 0; border-radius: 6px; }
  .job-list { max-height: 38vh; }
  .job-list button { min-height: 72px; padding: 11px 12px; }
  .job-detail { padding: 14px 12px 24px; overflow: visible; }
  .job-detail > header { position: sticky; top: -14px; z-index: 1; margin: -14px -12px 14px; padding: 14px 12px 10px; background: var(--bg); }
  .job-detail h3 { margin-top: 18px; }
  dl { grid-template-columns: 62px minmax(0, 1fr); gap: 6px 8px; margin: 14px 0; }
  .params { grid-template-columns: 92px minmax(0, 1fr); padding: 9px; }
  .messages pre, .attempts > article > pre, .job-detail > pre { max-height: 48vh; padding: 10px; font-size: 12px; }
  .attempts article header time { max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .job-detail code { display: block; max-width: 190px; }
}
</style>
