<script setup>
import { computed, reactive, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.js'
import UiButton from '../components/UiButton.vue'
import UiMessage from '../components/UiMessage.vue'

const props = defineProps({ jobs: { type: Array, default: () => [] }, error: { type: String, default: '' }, loadDetail: { type: Function, required: true } })
const emit = defineEmits(['abort', 'clean-terminal'])
const filter = ref('all')
const selectedId = ref(props.jobs[0]?.id || '')
const details = reactive({})
const filters = [
  { id: 'all', label: '全部' },
  { id: 'running', label: '运行中' },
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败' },
]
const filteredJobs = computed(() => filter.value === 'all' ? props.jobs : props.jobs.filter(job => filter.value === 'running' ? isRunning(job) : job.status === filter.value))
const selected = computed(() => details[selectedId.value] || props.jobs.find(job => job.id === selectedId.value) || filteredJobs.value[0])
const runningCount = computed(() => props.jobs.filter(job => ['idle', 'running', 'streaming', 'validating', 'retrying'].includes(job.status)).length)
const completedCount = computed(() => props.jobs.filter(job => job.status === 'completed').length)
const failedCount = computed(() => props.jobs.filter(job => job.status === 'failed').length)

watch(() => props.jobs, jobs => {
  if (!jobs.some(job => job.id === selectedId.value)) selectedId.value = jobs[0]?.id || ''
}, { deep: true })

function selectFilter(id) {
  filter.value = id
  if (!filteredJobs.value.some(job => job.id === selectedId.value)) selectedId.value = filteredJobs.value[0]?.id || ''
}

async function selectJob(id) {
  selectedId.value = id
  if (!details[id]) details[id] = await props.loadDetail(id)
}

function statusLabel(status) {
  return { idle: '等待中', running: '运行中', streaming: '生成中', validating: '校验中', retrying: '重试中', completed: '已完成', failed: '失败', cancelled: '已取消', missing: '已缺失' }[status] || status
}

function statusIcon(status) {
  return { running: 'play', streaming: 'play', validating: 'bolt', retrying: 'bolt', completed: 'check', failed: 'close', cancelled: 'stop' }[status] || 'clock'
}

function title(job) { return job.source || job.request?.messages?.at(-1)?.content?.slice(0, 42) || 'LLM 请求' }
function model(job) { return job.request?.model || '-' }
function jobType(job) { return job.source || job.metadata?.type || job.metadata?.source || 'LLM Job' }
function location(job) { return job.mode === 'direct' ? '浏览器直连' : '服务端托管' }
function isRunning(job) { return ['idle', 'running', 'streaming', 'validating', 'retrying'].includes(job.status) }
function terminalCount() { return props.jobs.filter(job => !isRunning(job)).length }
</script>

<template>
  <main class="page jobs-view view">
    <header class="page-header jobs-header">
      <div class="page-header__title"><p class="eyebrow">EXECUTION OBSERVATORY</p><h1>LLM 任务</h1><p>沿着一次执行的生命周期检查输入、Provider 状态、输出和错误。</p></div>
      <UiButton :disabled="!terminalCount()" @click="$emit('clean-terminal')"><AppIcon name="trash" />清理终态任务</UiButton>
    </header>
    <UiMessage v-if="error" tone="danger" title="任务服务不可用">{{ error }}</UiMessage>

    <section class="job-overview" aria-label="任务状态概览">
      <div class="running"><span><AppIcon name="play" />运行中</span><strong>{{ runningCount }}</strong></div>
      <div class="completed"><span><AppIcon name="check" />已完成</span><strong>{{ completedCount }}</strong></div>
      <div class="failed"><span><AppIcon name="close" />失败</span><strong>{{ failedCount }}</strong></div>
      <div><span><AppIcon name="bolt" />总任务</span><strong>{{ jobs.length }}</strong></div>
    </section>

    <div class="panel jobs-console">
      <aside class="jobs-rail">
        <nav class="job-filters" aria-label="筛选任务"><button v-for="item in filters" :key="item.id" :class="{ active: filter === item.id }" @click="selectFilter(item.id)">{{ item.label }}</button></nav>
        <div class="job-list">
          <button v-for="job in filteredJobs" :key="job.id" :class="{ active: selected?.id === job.id }" @click="selectJob(job.id)">
            <span class="job-list__status" :class="job.status"><AppIcon :name="statusIcon(job.status)" size="12" /></span>
            <span class="job-list__copy"><strong>{{ title(job) }}</strong><small>{{ jobType(job) }} · {{ location(job) }}</small><time>{{ job.createdAt }}</time></span>
            <AppIcon name="chevron" size="12" />
          </button>
          <p v-if="!filteredJobs.length" class="job-list__empty">此筛选下没有任务</p>
        </div>
      </aside>

      <section v-if="selected" class="job-inspector">
        <header class="job-inspector__head">
          <div><span class="job-status" :class="selected.status"><AppIcon :name="statusIcon(selected.status)" size="13" />{{ statusLabel(selected.status) }}</span><h2>{{ title(selected) }}</h2><code>{{ selected.id }}</code></div>
          <UiButton v-if="isRunning(selected)" variant="danger" @click="$emit('abort', selected.id)"><AppIcon name="stop" />中止</UiButton>
        </header>

        <ol class="job-timeline" :class="selected.status">
          <li class="done"><i /><span>已创建</span><time>{{ selected.createdAt }}</time></li>
          <li class="done"><i /><span>Provider 已接收</span><time>{{ jobType(selected) }}</time></li>
          <li :class="{ done: selected.status === 'completed', current: isRunning(selected), error: selected.status === 'failed' }"><i /><span>{{ selected.status === 'failed' ? '执行失败' : isRunning(selected) ? '正在生成' : '输出完成' }}</span><time>{{ location(selected) }}</time></li>
        </ol>

        <details class="job-inspector__section" open>
          <summary><span>请求配置</span><small>REQUEST</small><AppIcon name="chevron" size="12" /></summary>
          <dl class="job-parameters"><div><dt>model</dt><dd>{{ model(selected) }}</dd></div><div><dt>temperature</dt><dd>{{ selected.request?.temperature }}</dd></div><div><dt>max_tokens</dt><dd>{{ selected.request?.maxTokens }}</dd></div><div><dt>stream</dt><dd>{{ selected.request?.stream ? 'true' : 'false' }}</dd></div></dl>
        </details>

        <details class="job-inspector__section" open>
          <summary><span>消息输入</span><small>{{ selected.request?.messages?.length || 0 }} MESSAGES</small><AppIcon name="chevron" size="12" /></summary>
          <div class="job-messages"><article v-for="(message, index) in selected.request?.messages || []" :key="index"><span>{{ message.role }}</span><p>{{ message.content }}</p></article></div>
        </details>

        <details class="job-inspector__section output-section" open>
          <summary><span>{{ selected.status === 'failed' ? '错误' : '模型输出' }}</span><small>OUTPUT</small><AppIcon name="chevron" size="12" /></summary>
          <pre :class="{ error: selected.status === 'failed' }">{{ selected.error || selected.responseText || '等待 Provider 返回更多内容…' }}</pre>
        </details>
      </section>
      <section v-else class="job-inspector empty-state">选择一个任务查看执行详情</section>
    </div>
  </main>
</template>
