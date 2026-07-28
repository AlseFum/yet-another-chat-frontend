<script setup>
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.js'
import UiButton from '../components/UiButton.vue'

const props = defineProps({ jobs: { type: Array, default: () => [] } })
const filter = ref('all')
const selectedId = ref(props.jobs[0]?.id || '')
const filters = [
  { id: 'all', label: '全部' },
  { id: 'running', label: '运行中' },
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败' },
]
const filteredJobs = computed(() => filter.value === 'all' ? props.jobs : props.jobs.filter(job => job.status === filter.value))
const selected = computed(() => props.jobs.find(job => job.id === selectedId.value) || filteredJobs.value[0])
const runningCount = computed(() => props.jobs.filter(job => job.status === 'running').length)
const completedCount = computed(() => props.jobs.filter(job => job.status === 'completed').length)
const failedCount = computed(() => props.jobs.filter(job => job.status === 'failed').length)

function selectFilter(id) {
  filter.value = id
  if (!filteredJobs.value.some(job => job.id === selectedId.value)) selectedId.value = filteredJobs.value[0]?.id || ''
}

function statusLabel(status) {
  return { running: '运行中', completed: '已完成', failed: '失败' }[status] || status
}

function statusIcon(status) {
  return { running: 'play', completed: 'check', failed: 'close' }[status] || 'clock'
}
</script>

<template>
  <main class="page jobs-view view">
    <header class="page-header jobs-header">
      <div class="page-header__title"><p class="eyebrow">EXECUTION OBSERVATORY</p><h1>LLM 任务</h1><p>沿着一次执行的生命周期检查输入、Provider 状态、输出和错误。</p></div>
      <UiButton><AppIcon name="trash" />清理终态任务</UiButton>
    </header>

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
          <button v-for="job in filteredJobs" :key="job.id" :class="{ active: selected?.id === job.id }" @click="selectedId = job.id">
            <span class="job-list__status" :class="job.status"><AppIcon :name="statusIcon(job.status)" size="12" /></span>
            <span class="job-list__copy"><strong>{{ job.source }}</strong><small>{{ job.model }} · {{ job.location }}</small><time>{{ job.createdAt }}</time></span>
            <AppIcon name="chevron" size="12" />
          </button>
          <p v-if="!filteredJobs.length" class="job-list__empty">此筛选下没有任务</p>
        </div>
      </aside>

      <section v-if="selected" class="job-inspector">
        <header class="job-inspector__head">
          <div><span class="job-status" :class="selected.status"><AppIcon :name="statusIcon(selected.status)" size="13" />{{ statusLabel(selected.status) }}</span><h2>{{ selected.source }}</h2><code>{{ selected.id }}</code></div>
          <UiButton v-if="selected.status === 'running'" variant="danger"><AppIcon name="stop" />中止</UiButton>
        </header>

        <ol class="job-timeline" :class="selected.status">
          <li class="done"><i /><span>已创建</span><time>{{ selected.createdAt }}</time></li>
          <li class="done"><i /><span>Provider 已接收</span><time>{{ selected.model }}</time></li>
          <li :class="{ done: selected.status === 'completed', current: selected.status === 'running', error: selected.status === 'failed' }"><i /><span>{{ selected.status === 'failed' ? '执行失败' : selected.status === 'running' ? '正在生成' : '输出完成' }}</span><time>{{ selected.location }}</time></li>
        </ol>

        <details class="job-inspector__section" open>
          <summary><span>请求配置</span><small>REQUEST</small><AppIcon name="chevron" size="12" /></summary>
          <dl class="job-parameters"><div><dt>model</dt><dd>{{ selected.model }}</dd></div><div><dt>temperature</dt><dd>0.7</dd></div><div><dt>max_tokens</dt><dd>4096</dd></div><div><dt>stream</dt><dd>true</dd></div></dl>
        </details>

        <details class="job-inspector__section" open>
          <summary><span>消息输入</span><small>2 MESSAGES</small><AppIcon name="chevron" size="12" /></summary>
          <div class="job-messages"><article><span>system</span><p>你是一个可靠的工作台助手。</p></article><article><span>user</span><p>根据当前上下文继续执行。</p></article></div>
        </details>

        <details class="job-inspector__section output-section" open>
          <summary><span>{{ selected.status === 'failed' ? '错误' : '模型输出' }}</span><small>OUTPUT</small><AppIcon name="chevron" size="12" /></summary>
          <pre :class="{ error: selected.status === 'failed' }">{{ selected.output || '等待 Provider 返回更多内容…' }}</pre>
        </details>
      </section>
      <section v-else class="job-inspector empty-state">选择一个任务查看执行详情</section>
    </div>
  </main>
</template>
