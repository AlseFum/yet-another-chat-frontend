import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ChatApplication } from '../applications/chat/chat-application.js'
import { ResourceApplication } from '../applications/resource/resource-application.js'
import { BrowserWorkspaceTransport } from '../network/browser-workspace-transport.js'
import { KeyRef } from './model/key-ref.js'
import { Workspace } from './model/workspace.js'

// 此 composable 是一个 URL Workspace 的浏览器侧协调器。Application 的
// State、初始化和业务行为均留在各自的 Application model 中。
const workspaceFromPath = pathname => {
  const segment = pathname.split('/').filter(Boolean)[0] || 'default'
  return /^[a-zA-Z0-9_-]+$/.test(segment) ? segment : 'default'
}

export function useWorkspace({ notify = () => {} } = {}) {
  // ---------------------------------------------------------------------------
  // Workspace 初始化
  // ---------------------------------------------------------------------------

  const workspaceId = workspaceFromPath(window.location.pathname)
  const transport = new BrowserWorkspaceTransport({ workspace: workspaceId })

  // 注册表只存在于浏览器。每个 Application 用 stateKey 声明其需要的
  // State 顶层键，Workspace.load() 因而可在单次 State 请求中读取它们。
  const workspace = reactive(new Workspace({
    id: workspaceId,
    transport,
    temporaryKeyRef: KeyRef.fromHash(),
    applications: [new ChatApplication(), new ResourceApplication()],
  }))

  // ---------------------------------------------------------------------------
  // 本地 Workspace 视图状态
  // ---------------------------------------------------------------------------

  // 当前页面是 Workspace shell 的短暂状态；Application 内的选择状态不在此处。
  const view = ref('chat')
  const sidebarOpen = ref(window.innerWidth > 760)
  const settingsOpen = ref(false)
  // Markdown 渲染是页面展示偏好，不属于 Workspace State，也不跨刷新保留。
  const renderMarkdown = ref(true)

  // 部分 Workspace 事件来自不能被 Vue 代理的 RxJS 与传输对象。版本号将
  // 这些事件桥接为 computed 可追踪的视图更新。
  const workspaceVersion = ref(0)

  // ---------------------------------------------------------------------------
  // 面向 Workspace shell 的派生状态
  // ---------------------------------------------------------------------------

  const applications = computed(() => { void workspaceVersion.value; return workspace.applications })
  const customSettings = computed(() => { void workspaceVersion.value; return workspace.customSettings })
  const temporaryKey = computed(() => { void workspaceVersion.value; return workspace.temporaryKey ? { ...workspace.temporaryKey.key, temporary: true } : null })
  const keys = computed(() => { void workspaceVersion.value; return workspace.allKeys() })
  const keyOptions = computed(() => keys.value.map(key => ({ value: key.id, label: key.id, description: key.temporary ? '临时直连' : key.provider })))
  const selectedKey = computed({
    get: () => { void workspaceVersion.value; return workspace.keyRef?.type === 'temporary' ? workspace.keyRef.key.id : workspace.state.ui.selectedKeyId || '' },
    set: keyId => { if (temporaryKey.value?.id !== keyId) void selectServerKey(keyId) },
  })
  const jobs = computed(() => { void workspaceVersion.value; return workspace.jobSnapshots() })
  const backendError = computed(() => { void workspaceVersion.value; return workspace.error })

  // ---------------------------------------------------------------------------
  // Workspace 生命周期
  // ---------------------------------------------------------------------------

  const workspaceSubscription = workspace.events.subscribe(() => { workspaceVersion.value += 1 })

  onMounted(async () => {
    try {
      // load() 会按注册的 Application State 键读取 summary，随后依次执行
      // Application.revive() 和 Application.init()。
      await workspace.load()
      workspaceVersion.value += 1
    } catch (error) {
      workspace.error = error.message
      workspaceVersion.value += 1
    }
  })

  onBeforeUnmount(() => {
    // SSE、WebSocket、Job 订阅和桥接订阅均属于当前 UI 实例。
    workspaceSubscription.unsubscribe()
    workspace.close()
  })

  // ---------------------------------------------------------------------------
  // Workspace 页面导航
  // ---------------------------------------------------------------------------

  function navigate(target) {
    view.value = target
    if (window.innerWidth <= 760) sidebarOpen.value = false
  }

  // ---------------------------------------------------------------------------
  // KeyRef 管理
  // ---------------------------------------------------------------------------

  async function selectServerKey(keyId) {
    try {
      await workspace.selectKey(keyId)
      notify(`当前 KeyRef 已切换为 ${keyId}`)
    } catch (error) { notify(error.message, 'danger') }
  }

  function updateCustomSetting(applicationId, name, value) {
    return workspace.updateCustomSetting(applicationId, name, value)
  }

  async function createServerKey(input) {
    const key = await workspace.createKey(input)
    notify(`凭据 ${key.id} 已保存到服务端`)
    return key
  }

  async function createTemporaryKey(input) {
    // temporary KeyRef 只变更内存，不 patch State，也不会发送给本后端。
    const keyRef = workspace.useTemporaryKey(input)
    notify(`正在使用临时 KeyRef ${keyRef.key.id}`)
    return { ...keyRef.key, temporary: true }
  }

  async function deleteServerKey(keyId, temporary = false) {
    if (temporary) {
      workspace.clearTemporaryKey()
      notify(`临时凭据 ${keyId} 已从内存清除`)
      return
    }
    await workspace.deleteKey(keyId)
    notify(`凭据 ${keyId} 已删除`)
  }

  // ---------------------------------------------------------------------------
  // Job 管理与页面展示偏好
  // ---------------------------------------------------------------------------

  async function abortJob(jobId) {
    try {
      await workspace.abortJob(jobId)
      notify(`已请求中止 Job ${jobId}`)
    } catch (error) { notify(error.message, 'danger') }
  }

  async function cleanTerminalJobs() {
    const terminal = jobs.value.filter(job => ['completed', 'failed', 'cancelled', 'missing'].includes(job.status))
    try {
      for (const job of terminal) await workspace.cleanJob(job.id)
      if (terminal.length) notify(`已清理 ${terminal.length} 个终态 Job`)
    } catch (error) { notify(error.message, 'danger') }
  }

  async function loadJobDetail(jobId) {
    try { return await workspace.loadJobDetail(jobId) } catch (error) { notify(error.message, 'danger'); throw error }
  }

  function setRenderMarkdown(value) {
    renderMarkdown.value = value
  }

  // ---------------------------------------------------------------------------
  // Composable 接口
  // ---------------------------------------------------------------------------

  return {
    abortJob,
    applications,
    backendError,
    cleanTerminalJobs,
    customSettings,
    createServerKey,
    createTemporaryKey,
    deleteServerKey,
    jobs,
    keys,
    loadJobDetail,
    navigate,
    renderMarkdown,
    selectedKey,
    selectServerKey,
    updateCustomSetting,
    setRenderMarkdown,
    settingsOpen,
    sidebarOpen,
    get state() { return workspace.state },
    view,
    workspace,
    workspaceId,
  }
}
