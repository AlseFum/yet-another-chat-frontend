<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Button from '../../components/Button.vue'
import { toast } from '../../components/Toast.vue'
import Icon from '../../components/Icon.vue'
import { formatDateTimeLocal, formatSessionTime, parseDateTimeLocal, sessionNow } from './clock.js'
import { createConversationMessage, createPlan } from './model.js'
import { PROMPT_STAGES } from '../../../../llm/prompts/talk.js'
import { runTalkPipeline } from './runtime.js'

const props = defineProps({ talk: { type: Object, required: true }, activeSessionId: { type: String, default: '' }, genId: { type: Function, required: true }, apiKeys: { type: Array, default: () => [] }, runStage: { type: Function, required: true } })
const emit = defineEmits(['save', 'create-session', 'select-session', 'rename-session', 'delete-session'])
const message = ref('')
const planAction = ref('')
const planAt = ref('')
const showPrompts = ref(false)
const activeView = ref('conversation')
const running = ref(false)
const runtimeStatus = ref('')
const editingSessionName = ref(false)
const sessionName = ref('')
const session = computed(() => props.talk.sessions.find(item => item.id === props.activeSessionId) || props.talk.sessions[0])
if (!props.talk.modelConfig) props.talk.modelConfig = { apiKeyId: '', model: 'deepseek-v4-flash', temperature: '0.7', maxTokens: '2048' }
if (!props.talk.activity) props.talk.activity = { enabled: true, minReplyIntervalMinutes: 60, maxProactivePerSession: 2 }
const config = computed(() => props.talk.modelConfig)
let timer = null

function save() { emit('save', props.talk) }
function startRenameSession() {
  if (!session.value) return
  sessionName.value = session.value.name
  editingSessionName.value = true
}
function saveSessionName() {
  const name = sessionName.value.trim()
  if (!session.value || !name) return
  emit('rename-session', session.value.id, name)
  editingSessionName.value = false
}
function cancelRenameSession() { editingSessionName.value = false }
function deleteSession() {
  if (!session.value || !confirm(`删除 Session“${session.value.name}”？此操作无法撤销。`)) return
  editingSessionName.value = false
  emit('delete-session', session.value.id)
}
function sendMessage() {
  if (!message.value.trim() || !session.value) return
  session.value.conversation.push(createConversationMessage({ id: props.genId(), role: 'user', content: message.value }))
  session.value.events.push({ id: props.genId(), type: 'user_message', occurredAt: new Date().toISOString(), payload: { messageId: session.value.conversation.at(-1).id } })
  message.value = ''
  save()
  void runPipeline()
}
function addPlan() {
  if (!planAction.value.trim() || !planAt.value || !session.value) return
  session.value.plans.push(createPlan({ id: props.genId(), action: planAction.value, scheduledAt: new Date(planAt.value).toISOString() }))
  planAction.value = ''
  planAt.value = ''
  save()
}
function advance() { void runPipeline() }

function setClockAt(desired) {
  if (!session.value) return
  session.value.clock.anchorRealAt = new Date().toISOString()
  session.value.clock.anchorSessionAt = desired.toISOString()
  session.value.clock.offsetMs = 0
  handleClockChange()
}
function setSessionTime(value) {
  if (!value || !session.value) return
  const desired = parseDateTimeLocal(value, session.value.clock.timezone || 'Asia/Shanghai')
  if (desired) setClockAt(desired)
}
function shiftSessionTime(ms) {
  if (session.value) setClockAt(new Date(new Date(sessionNow(session.value.clock)).getTime() + ms))
}
function syncSessionTime() {
  if (!session.value) return
  const current = new Date()
  session.value.clock.anchorRealAt = current.toISOString()
  session.value.clock.anchorSessionAt = current.toISOString()
  session.value.clock.offsetMs = 0
  session.value.clock.rate = 1
  handleClockChange()
}
function setOffsetHours(value) { if (session.value) { session.value.clock.offsetMs = (Number(value) || 0) * 3600000; handleClockChange() } }
function setRate(value) { if (session.value) { session.value.clock.rate = Math.max(0, Number(value) || 1); handleClockChange() } }
function handleClockChange() {
  if (!session.value) return
  session.value.events.push({ id: props.genId(), type: 'session_time_shift', occurredAt: sessionNow(session.value.clock), payload: { lastProcessedAt: session.value.lastProcessedAt } })
  save()
  void runPipeline()
}
function addOpenEvent() {
  if (session.value) session.value.events.push({ id: props.genId(), type: 'session_opened', occurredAt: new Date().toISOString(), payload: {} })
}
function schedule() {
  window.clearTimeout(timer)
  if (!session.value || document.hidden) return
  const upcomingPlan = session.value.plans.filter(plan => plan.status === 'pending').map(plan => plan.scheduledAt).sort()[0]
  const target = [session.value.nextCheckAt, upcomingPlan].filter(Boolean).sort()[0]
  if (!target) return
  const delay = Math.max(10000, Math.min(new Date(target).getTime() - Date.now(), 30 * 60 * 1000))
  timer = window.setTimeout(() => void runPipeline(), delay)
}
async function runPipeline() {
  if (running.value || !session.value || document.hidden) return
  if (!config.value?.apiKeyId) { runtimeStatus.value = '请选择 Talk 的 API Key 后再运行'; return }
  running.value = true
  runtimeStatus.value = '正在处理本回合'
  try {
    const result = await runTalkPipeline({ talk: props.talk, session: session.value, genId: props.genId, visible: !document.hidden, requestStage: (stage, context) => props.runStage(props.talk, stage, context) })
    runtimeStatus.value = result.message ? '已发送一条消息' : `本回合决定：${result.decision}`
    save()
  } catch (error) {
    runtimeStatus.value = ''
    toast.error(`Talk 运行失败: ${error.message}`)
  } finally {
    running.value = false
    save()
    schedule()
  }
}
function handleVisibility() { if (!document.hidden) schedule() }

onMounted(() => {
  addOpenEvent()
  save()
  void runPipeline()
  document.addEventListener('visibilitychange', handleVisibility)
})
onUnmounted(() => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', handleVisibility) })
watch(() => session.value?.id, () => { activeView.value = 'conversation'; addOpenEvent(); save(); void runPipeline() })
</script>

<template>
  <main class="talk-view">
    <header class="talk-head">
      <div class="talk-title-row"><div class="talk-identity"><h1>{{ talk.name }}</h1></div><nav v-if="session" class="session-breadcrumb" aria-label="Session 选择"><span>Session</span><span class="breadcrumb-separator">/</span><select v-if="!editingSessionName" :value="session.id" @change="emit('select-session', $event.target.value)"><option v-for="item in talk.sessions" :key="item.id" :value="item.id">{{ item.name }}</option></select><form v-else class="session-name-form" @submit.prevent="saveSessionName"><input v-model="sessionName" aria-label="Session 名称" autofocus @keydown.esc.prevent="cancelRenameSession" /><Button type="submit" variant="ghost" size="icon" title="保存名称"><Icon name="check" /></Button><Button type="button" variant="ghost" size="icon" title="取消编辑" @click="cancelRenameSession"><Icon name="close" /></Button></form><template v-if="!editingSessionName"><Button variant="ghost" size="icon" title="编辑 Session 名称" @click="startRenameSession"><Icon name="edit" /></Button><Button variant="ghost" size="icon" title="删除 Session" @click="deleteSession"><Icon name="trash" /></Button></template><Button variant="ghost" size="icon" title="新建 Session" @click="emit('create-session')"><Icon name="plus" /></Button></nav></div>
      <div v-if="session" class="talk-head-actions">
        <div class="talk-view-actions"><Button variant="ghost" size="icon" title="角色状态" @click="activeView = 'state'"><Icon name="info" /></Button><Button variant="ghost" size="icon" title="计划" @click="activeView = 'plan'"><Icon name="list" /></Button><Button variant="ghost" size="icon" title="运行配置" @click="activeView = 'runtime'"><Icon name="settings" /></Button></div>
      </div>
    </header>

    <div v-if="!talk.sessions.length" class="talk-empty"><p>这个 Talk 还没有 Session。</p><Button @click="emit('create-session')">开始第一个 Session</Button></div>
    <template v-else-if="session">
      <div class="session-context"><span>{{ formatSessionTime(session.clock) }}</span><span>{{ session.clock.rate }}x</span><span v-if="runtimeStatus" class="runtime-status">{{ runtimeStatus }}</span><Button variant="ghost" size="sm" :loading="running" @click="advance"><Icon name="play" />运行</Button></div>

      <section v-if="activeView === 'conversation'" class="conversation-pane">
        <div class="conversation-scroll">
          <div class="conversation-meta"><span>{{ session.conversation.length }} 条消息</span></div>
          <div class="messages"><p v-if="!session.conversation.length" class="empty">消息有强时效；长期影响会沉淀为角色状态与记忆。</p><article v-for="item in session.conversation" :key="item.id" class="talk-message" :class="item.role"><span>{{ item.role === 'user' ? '用户' : 'Talk' }}</span><p>{{ item.content }}</p></article></div>
        </div>
        <form class="message-input" @submit.prevent="sendMessage"><textarea v-model="message" rows="2" placeholder="给 Talk 留言，它不一定会立刻回复。" /><Button type="submit" :disabled="!message.trim()">发送</Button></form>
      </section>

      <section v-else-if="activeView === 'state'" class="talk-subview state-view">
        <header class="subview-head"><Button variant="ghost" size="icon" title="返回对话" @click="activeView = 'conversation'"><Icon name="back" /></Button><div><p class="eyebrow">CHARACTER</p><h2>角色状态</h2></div></header>
        <section class="subview-section"><h3>State</h3><p class="panel-note">仅记录客观现实</p><p class="state-text">{{ session.state || '尚无状态记录' }}</p></section>
        <section class="subview-section"><h3>Memory</h3><p class="panel-note">角色的主观看法</p><p v-if="!session.memory.length" class="empty">尚无记忆</p><article v-for="item in [...session.memory].reverse()" :key="item.id" class="memory-item"><strong>{{ item.belief || item.content }}</strong><span v-if="item.feeling">{{ item.feeling }}</span></article></section>
      </section>

      <section v-else-if="activeView === 'plan'" class="talk-subview plan-view">
        <header class="subview-head"><Button variant="ghost" size="icon" title="返回对话" @click="activeView = 'conversation'"><Icon name="back" /></Button><div><p class="eyebrow">PLANS</p><h2>计划</h2></div></header>
        <div class="plan-form"><input v-model="planAction" placeholder="计划做什么" /><input v-model="planAt" type="datetime-local" /><Button size="sm" @click="addPlan">添加</Button></div>
        <p v-if="!session.plans.length" class="empty">尚无计划</p><article v-for="plan in session.plans" :key="plan.id" class="plan-item"><strong>{{ plan.action }}</strong><span>{{ new Date(plan.scheduledAt).toLocaleString('zh-CN') }} · {{ plan.status }}{{ plan.contactIntent === 'send' ? ' · 待联络' : '' }}</span></article>
      </section>

      <section v-else class="talk-subview runtime-view">
        <header class="subview-head"><Button variant="ghost" size="icon" title="返回对话" @click="activeView = 'conversation'"><Icon name="back" /></Button><div><p class="eyebrow">RUNTIME</p><h2>运行</h2></div></header>
        <section class="runtime-section"><h3>模型配置</h3><div class="runtime-fields"><label>API Key<select v-model="config.apiKeyId" @change="save"><option value="">请选择</option><option v-for="key in apiKeys" :key="key.id" :value="key.id">{{ key.name }}</option></select></label><label>模型<input v-model="config.model" @change="save" /></label><label>最短联络间隔<input v-model.number="talk.activity.minReplyIntervalMinutes" type="number" min="0" @change="save" /></label><label class="switch"><input v-model="talk.activity.enabled" type="checkbox" @change="save" />启用主动行为</label></div></section>
        <section class="runtime-section clock-section"><div><h3>Session 时钟</h3><time>{{ formatSessionTime(session.clock) }}</time></div><div class="clock-shortcuts"><Button variant="ghost" size="sm" @click="shiftSessionTime(-86400000)">前一天</Button><Button variant="ghost" size="sm" @click="shiftSessionTime(-3600000)">-1 小时</Button><Button variant="ghost" size="sm" @click="shiftSessionTime(3600000)">+1 小时</Button><Button variant="ghost" size="sm" @click="shiftSessionTime(86400000)">后一天</Button><Button size="sm" @click="syncSessionTime">同步现实时间</Button></div><label class="clock-jump">跳转至<input :value="formatDateTimeLocal(sessionNow(session.clock), session.clock.timezone || 'Asia/Shanghai')" type="datetime-local" @change="setSessionTime($event.target.value)" /></label><details class="clock-advanced"><summary>高级设置</summary><div><label>偏移（小时）<input :value="session.clock.offsetMs / 3600000" type="number" step="0.5" @change="setOffsetHours($event.target.value)" /></label><label>时间倍率<input :value="session.clock.rate" type="number" min="0" step="0.1" @change="setRate($event.target.value)" /></label><label>时区<input v-model="session.clock.timezone" placeholder="Asia/Shanghai" @change="handleClockChange" /></label></div></details></section>
        <section class="runtime-section"><div class="runtime-section-head"><h3>Prompt 定义</h3><Button variant="ghost" size="sm" @click="showPrompts = !showPrompts">{{ showPrompts ? '收起' : '查看' }}</Button></div><div v-if="showPrompts" class="prompt-stages"><article v-for="stage in PROMPT_STAGES" :key="stage.id"><div><strong>{{ stage.title }}</strong><p>{{ stage.description }}</p></div><code>{{ stage.writes }}</code></article></div></section>
      </section>
    </template>
  </main>
</template>

<style scoped>
.talk-view { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; padding: 22px clamp(16px, 4vw, 52px) 28px; }
  .talk-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex: 0 0 auto; padding-bottom: 14px; border-bottom: 1px solid var(--ol-bdr); }.talk-title-row, .talk-head-actions, .talk-view-actions, .session-breadcrumb, .session-name-form { display: flex; align-items: center; gap: 6px; }.talk-title-row { min-width: 0; gap: 14px; }.talk-identity { min-width: 0; }.eyebrow { margin: 0 0 4px; color: var(--accent2); font-size: 10px; font-weight: 700; letter-spacing: .14em; }.talk-head h1 { margin: 0; font-size: 24px; }.session-breadcrumb { min-width: 0; color: var(--text-faint); font-size: 11px; white-space: nowrap; }.breadcrumb-separator { color: var(--text-faint); }.session-breadcrumb select { min-width: 100px; max-width: 180px; border: 0; background: transparent; color: var(--text); font: inherit; font-size: 12px; outline: none; }.session-name-form input { width: min(180px, 35vw); min-width: 0; border: 1px solid var(--ol-bdr); border-radius: 4px; padding: 4px 6px; background: var(--ol-input); color: var(--text); font: inherit; font-size: 12px; }
.session-context { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; min-height: 30px; color: var(--text-faint); font-size: 11px; }.runtime-status { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); }.session-context > :last-child { margin-left: auto; }.conversation-pane { display: flex; flex: 1; flex-direction: column; min-height: 0; margin-top: 10px; border-top: 1px solid var(--ol-bdr); }.conversation-scroll { flex: 1; min-height: 0; overflow: auto; padding: 14px 0; }.conversation-meta { display: flex; justify-content: flex-end; color: var(--text-faint); font-size: 11px; }.messages { display: flex; flex-direction: column; gap: 10px; min-height: 100%; padding: 12px 0; }.empty, .panel-note { color: var(--text-faint); font-size: 12px; }.talk-message { max-width: min(78%, 720px); padding: 8px 10px; border: 1px solid var(--ol-bdr); border-radius: 6px; font-size: 13px; line-height: 1.6; }.talk-message.user { align-self: flex-end; border-color: rgba(244,63,94,.25); background: var(--glass-msg-user); }.talk-message > span { display: block; margin-bottom: 3px; color: var(--text-faint); font-size: 10px; font-weight: 600; }.talk-message p { margin: 0; white-space: pre-wrap; font-family: 'Noto Serif SC', 'Songti SC', 'STSong', ui-serif, Georgia, serif; font-size: 15px; line-height: 1.75; }.message-input { display: flex; align-items: flex-end; gap: 8px; flex: 0 0 auto; padding-top: 12px; border-top: 1px solid var(--ol-bdr); }.message-input textarea, .plan-form input, .runtime-fields input, .runtime-fields select, .clock-jump input, .clock-advanced input { min-width: 0; border: 1px solid var(--ol-bdr); border-radius: 4px; padding: 7px 8px; background: var(--ol-input); color: var(--text); font: inherit; font-size: 12px; }.message-input textarea { flex: 1; resize: vertical; }
.talk-subview { flex: 1; min-height: 0; overflow: auto; padding: 20px 0 0; }.subview-head { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--ol-bdr); }.subview-head h2 { margin: 0; font-size: 17px; }.subview-section, .runtime-section { padding: 18px 0; border-bottom: 1px solid var(--ol-bdr); }.subview-section h3, .runtime-section h3 { margin: 0 0 3px; font-size: 13px; }.state-text { margin: 14px 0 0; color: var(--text-dim); font-size: 13px; line-height: 1.7; white-space: pre-wrap; }.memory-item, .plan-item { display: grid; gap: 3px; padding: 12px 0; border-top: 1px solid var(--ol-bdr); color: var(--text-dim); font-size: 12px; line-height: 1.6; }.memory-item:first-of-type, .plan-item:first-of-type { margin-top: 12px; }.memory-item strong, .plan-item strong { color: var(--text); }.memory-item span, .plan-item span { color: var(--text-faint); font-size: 11px; }.plan-form { display: flex; gap: 8px; padding: 2px 0 16px; border-bottom: 1px solid var(--ol-bdr); }.plan-form input:first-child { flex: 1; }.plan-form input:nth-child(2) { width: 170px; }
.runtime-fields { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; }.runtime-fields label, .clock-jump, .clock-advanced label { display: flex; flex-direction: column; gap: 4px; color: var(--text-faint); font-size: 10px; font-weight: 600; }.runtime-fields > label:first-child { min-width: 200px; }.runtime-fields .switch { flex-direction: row; align-items: center; min-height: 32px; }.clock-section { display: grid; grid-template-columns: auto 1fr; gap: 14px 24px; align-items: center; }.clock-section time { color: var(--text); font-size: 15px; font-weight: 600; }.clock-shortcuts { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }.clock-jump, .clock-advanced { grid-column: 1 / -1; }.clock-jump { flex-direction: row; align-items: center; }.clock-advanced { padding-top: 12px; border-top: 1px solid var(--ol-bdr); color: var(--text-dim); font-size: 12px; }.clock-advanced summary { cursor: pointer; }.clock-advanced > div { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }.runtime-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.prompt-stages { margin-top: 10px; }.prompt-stages article { display: grid; grid-template-columns: 1fr auto; gap: 5px 12px; padding: 12px 0; border-top: 1px solid var(--ol-bdr); }.prompt-stages strong { color: var(--text); font-size: 12px; }.prompt-stages p { margin: 3px 0 0; color: var(--text-dim); font-size: 12px; line-height: 1.6; }.prompt-stages code { color: var(--accent2); font: 10px ui-monospace, monospace; }
.talk-empty { display: grid; flex: 1; place-items: center; align-content: center; gap: 12px; color: var(--text-dim); text-align: center; }
@media (max-width: 800px) { .talk-view { padding: 14px 12px 16px; }.talk-head { align-items: flex-start; }.talk-title-row { flex-wrap: wrap; gap: 5px 10px; }.talk-head h1 { font-size: 20px; }.talk-head-actions { gap: 3px; }.session-breadcrumb select { max-width: 150px; }.session-context { gap: 7px; flex-wrap: wrap; }.runtime-status { order: 3; width: 100%; }.session-context > :last-child { margin-left: 0; }.talk-message { max-width: 92%; }.plan-form { flex-wrap: wrap; }.plan-form input:nth-child(2) { flex: 1; width: auto; }.clock-section { grid-template-columns: 1fr; }.clock-shortcuts { justify-content: flex-start; }.clock-jump { align-items: flex-start; flex-direction: column; }.runtime-fields > label:first-child { min-width: min(100%, 220px); }.message-input { padding-bottom: env(safe-area-inset-bottom); } }
</style>
