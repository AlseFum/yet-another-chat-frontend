# Applications 规范

## 概述

`web/src/applications/` 存放工作台中所有 Application。Application 是拥有独立状态、UI 视图和业务逻辑的功能模块，每个 Application 对应一个独立的工作场景（如对话、资源管理，沉浸式交互，工作流等等）。

一个 Application 由三部分组成：

- **Application Model** (`xxx-application.js`) — 状态与业务逻辑，纯 JS 类，不依赖 Vue
- **Application View** (`XxxView.vue` / `XxxApplication.vue`) — 主视图，在 `App.vue` 中被 `view` 路由切换
- **Navigation Section** (`XxxSection.vue`) — 侧边栏导航区块，在 `WorkspaceNavigation.vue` 中渲染

## 目录结构

```
applications/
├── SPEC.md
├── chat/
│   ├── chat-application.js
│   ├── ChatApplication.vue    (或 ChatView.vue)
│   ├── ChatSection.vue
│   └── ui/                    (可选，本 Application 独有的 UI 组件)
└── resource/
    ├── resource-application.js
    ├── ResourceView.vue
    ├── ResourceSection.vue
    └── ui/
```

## Application Model 规范

每个 Application Model 必须是一个 class，实现以下契约：

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识，与目录名一致，全小写英文 |
| `stateKey` | `string` | 在 Workspace State 中使用的顶层 key |
| `workspace` | `Workspace \| null` | `revive()` 时注入 |
| `ui` | `object` | 本 Application 的 UI 选择状态（如 activeConversationId） |

### 方法

- **`revive(workspace)`** — 从 Workspace State 读取数据恢复自身状态，注入 workspace 引用
- **`init()`** — 状态恢复后的初始化（校验、设置默认值等）
- **`sync()`** — 将当前状态写入 `workspace.state`
- **`save()`** — 调用 `sync()` 后持久化到后端

其他业务方法由各 Application 自行定义。

### State 持久化

Application 的状态通过 `stateKey` 作为顶层 key 存储在 Workspace State 中，结构为 `{ ui: {...} }` + 各业务数据字段。由 `sync()` 写入、`revive()` 读取。

状态示例（ChatApplication）：
```
stateKey 'chat' → {
  ui: { activeConversationId: 'chat-xxx' },
  conversations: [ ... ]
}
```

## Job 集成与刷新恢复

需要调用 LLM 的 Application 不应直接操作 `JobManager`，统一通过
`workspace.createJob({ request, keyRef, metadata, onEvent })` 创建 Job。Workspace
负责选择 direct/server 执行方式、启动 Job、持久化服务端 Job 以及转发 Job 事件。

Application 负责以下内容：

- 在业务数据中保存必要的 `jobId`，使刷新后可以把业务对象重新关联到 Job
- 在 `onEvent` 中处理 `delta`、`result` 和 `completed`、`failed`、`cancelled` 等终态事件
- 将流式输出写入自己的状态，并在合适的时机调用 `save()`
- 在 `revive(workspace)` 中重新查找仍处于流式状态的 Job
- 恢复时先使用 Job 快照中的 `responseText`、`reasoning` 等字段补齐已经产生的输出，再订阅后续事件
- Job 进入终态后停止 `streaming` 状态，并取消 Application 自己创建的订阅

刷新恢复的基本流程如下：

```js
revive(workspace) {
  this.workspace = workspace
  this.restoreState(workspace.state.get(this.stateKey, {}))

  for (const item of this.runningItems()) {
    const job = workspace.jobsManager.get(item.jobId)
    if (!job) continue
    this.applyJobSnapshot(item, job)
    this.bindJob(item, job)
  }
}
```

`revive()` 可能被多次调用，因此 Job 订阅必须按 `jobId` 去重，并清理已经不再关联的订阅。
Application 应提供 `close()`，在其中释放所有 Job 订阅；Workspace 销毁时会调用它。
Workspace 收到 Job 事件时不会重新调用 Application 的 `revive()`，Application 应直接在订阅回调中更新自身的响应式状态。

临时 Key 的 Job 只存在于当前浏览器进程，刷新后无法恢复执行；服务端 Key 的 Job 才能通过持久化的
`jobId` 和 Job 快照恢复。刷新期间错过的 delta 不要求逐条重放，但恢复时必须显示服务端当前快照，连接建立后继续接收新的事件。

## Navigation Section 规范

侧边栏区块通过 `WorkspaceNavigation.vue` 中的 `sections` 数组注册：

```js
const sections = [
  { id: 'chat', component: ChatSection },
  { id: 'resource', component: ResourceSection },
]
```

Section 组件接收 props：
- `application` — Application Model 实例
- `active` — 当前 view 是否是本 Application

Section 组件 emit 事件：
- `navigate` — 切换到本 Application 的 view
- `notify` — 显示通知

## 添加新 Application 的步骤

1. 在 `applications/` 下创建目录 `xxx/`
2. 实现 Application Model `xxx-application.js`
3. 实现主视图 `XxxView.vue`，导入 Application Model
4. 实现侧边栏 Section `XxxSection.vue`
5. 在 `use-workspace.js` 中 import 并注册到 `applications` 数组
6. 在 `WorkspaceNavigation.vue` 中 import Section 并注册到 `sections` 数组
7. 在 `App.vue` 中 import View 并添加 `v-else-if` 分支

## 开发约定

- **Application Model 保持纯 JS**，不含 Vue API（ref/reactive/computed），保持可测试性
- View 组件只做 UI 编排和事件转发，不包含业务逻辑
- Section 组件尽可能轻量，只做侧边栏导航
- 目录名、id、stateKey 必须一致，使用全小写英文
- 若有独有 UI 组件，放在该 Application 目录下的 `ui/` 中
- 各 Application 的状态互不依赖，不应读写其他 Application 的 stateKey
- `App.vue` 的 view 路由使用 application id 作为 view name（如 `view === 'chat'`）
- Application 创建 Job 后必须持久化业务对象与 `jobId` 的关联，不能只保存在内存中
- Job 订阅必须可去重、可取消，不能因为重复调用 `revive()` 产生重复 delta 或订阅泄漏
