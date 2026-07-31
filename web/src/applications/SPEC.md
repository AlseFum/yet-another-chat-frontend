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

### Resource Capability

ResourceApplication 负责资源内部状态和持久化；Workspace 将它包装为 `workspace.resources` capability，供
Chat、Tool 和其他 Application 使用。外部不得直接访问或修改 `ResourceApplication.text`、`preset`、`tool`
数组。

只读借用对应 Rust 的 `&T`，返回 `Result<ReadLease>`：

```js
const result = workspace.resources.borrow('text', textId)
if (!result.ok) throw result.error

const lease = result.value
const text = lease.read()
lease.release()
```

同一 Resource 可以同时存在多个只读 lease。`read()` 返回资源快照，修改快照不会改动 ResourceApplication。

可变借用对应 Rust 的 `&mut T`，返回 `Result<WriteLease>`：

```js
const result = workspace.resources.borrowMut('text', textId)
if (!result.ok) throw result.error

const lease = result.value
const updateResult = await lease.update({ content: '新内容' })
lease.release()
if (!updateResult.ok) throw updateResult.error
```

可变 lease 提供 `update(patch)` 和 `replace(value)`；两者通过 ResourceApplication 保存，并返回
`Promise<Result<ResourceSnapshot>>`。借用规则如下：

- 没有可变 lease 时，可以取得任意数量的只读 lease
- 存在任意只读 lease 时，不能取得可变 lease
- 存在可变 lease 时，不能取得其他只读或可变 lease
- 资源不存在、类型无效或借用冲突都返回 `{ ok: false, error }`，不会因冲突直接抛出
- lease 的方法在 `release()` 后调用属于编程错误，会抛出 `LEASE_RELEASED`
- 调用方必须在 `finally` 中释放 lease；Workspace 关闭时会统一丢弃剩余 lease

Resource capability 另提供不占用 lease 的只读快照方法：

```js
workspace.resources.list('tool')
workspace.resources.get('preset', presetId)
```

需要跨多个异步步骤保证资源不被其他调用方修改时，必须使用 lease，而不是重复调用 `get()`。

借用冲突时可以等待一段有限时间：

```js
const readResult = await workspace.resources.borrowUntil('text', textId, 1500)
const writeResult = await workspace.resources.borrowMutUntil('text', textId, 1500)
```

两者都返回 `Promise<Result<Lease>>`。如果 lease 在 `timeoutMs` 内可用，就按普通 `borrow()` / `borrowMut()`
返回；超过时间则返回错误码 `TIMEOUT`。资源不存在和类型无效会立即返回，不进入等待。`timeoutMs` 必须是
大于等于 0 的有限数字；`0` 表示只尝试一次，冲突时立即返回 `TIMEOUT`。Workspace 关闭时，所有等待请求
返回 `CLOSED`，已经取得的 lease 也会失效。

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

## CustomSettings 与 JobRequest

每个 Application 可以通过静态 `schema()` 声明自己的 Workspace 级设置。Schema 不是 JSON Schema，而是
面向设置界面的轻量字段描述对象。Application 不把当前设置放进自己的业务 State；Workspace 通过独立的
`custom-settings` 后端资源统一加载、保存和编辑。

推荐结构：

```
static schema() {
  return {
    useInjectedPrompt: { type: 'boolean', label: '使用注入 Prompt', default: false },
    injectedPrompt: { type: 'textarea', label: '注入 Prompt', default: '' },
  }
}
```

Chat 的 Workspace 级设置只用于 Prompt 注入：`useInjectedPrompt` 控制是否启用注入，`injectedPrompt` 保存要注入的
多段文字。启用且内容非空时，`createChatJobRequest()` 会将它作为首条 `system` 消息放在对话消息之前；
关闭或内容为空时，不添加额外消息。模型、temperature、maxTokens、thinking、stream 等请求参数属于
对话或单次 Job 的配置，不应放入 customSettings。

第一版支持五种 field：`number`、`text`、`select`、`textarea`、`boolean`。字段名就是 object key。所有
字段支持 `type`、`label`、`description`、`default`；`number` 额外支持 `min`、`max`、`step`，
`select` 支持 `options`。`text` 由通用编辑器限制为单行、最多 80 个字符。

`textarea` 类型可以声明 `variables` 数组，用于说明 Prompt 模板支持的插值参数。通用设置页面会在输入框
下方展示这些参数，例如 `variables: ['name', 'content']` 会显示 `{{name}}` 和 `{{content}}`。实际插值由
对应的 `createXXXJobRequest({ businessInput }, customSetting)` 完成。

Resource Application 的 `customSettings` 按资源类型分别提供 `generateTextPrompt`、`generatePresetPrompt` 和
`generateToolPrompt`，另有生成 Temperature 和 Max tokens。三类资源都可以在编辑页通过 AI 生成按钮创建或重写
内容。生成模板使用 `{{name}}`、`{{content}}`、`{{description}}`、`{{temperature}}`、`{{maxTokens}}` 等插值，
请求工厂只替换当前资源类型需要的变量。生成 Job 仍通过 Workspace 创建，生成过程中的临时 `generating`
状态不写入 Resource State。

Resource Application 还提供统一的 `autoSave` 设置，作用于 Text、Preset 和 Tool 三类资源。开启时，编辑内容
会在短暂防抖后自动保存；关闭时，编辑页显示手动“保存”按钮。创建、删除和 AI 生成等结构性操作无论保存
模式如何都应立即持久化。

Tool 编辑器使用固定的 `async function <name>(ctx) { ... }` 外壳，资源内容只保存函数体。Tool 只维护一个
`args` 文本，用于说明调用方传入的 `ctx.args`；不再拆成参数列表。运行时 `ctx` 还提供 `fetch`、`signal`、
`workspace`、`job`、`resources` 和 `logger` 等全局能力。Tool 的生成 Prompt 通过 `{{functionName}}`、
`{{args}}` 和 `{{globals}}` 提供这些上下文；函数名支持 Unicode 标识符，不得让模型重复生成函数声明或代码围栏。

Text 还支持根据当前内容生成可选的高亮规则。高亮规则保存在 Text 资源的 `highlights` 数组中，不修改正文：

```js
{
  pattern: 'TODO|FIXME',
  className: 'keyword',
  description: '待处理标记',
  color: '#f59e0b',
  background: '',
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  enabled: true,
}
```

`pattern` 是要匹配的字面量文本，不执行 JavaScript 正则表达式；`className` 只能使用字母、数字、下划线和短横线，并映射到编辑器。
规则还支持可编辑的 `color`、`background`、`bold`、`italic`、`underline` 和 `strikethrough` 样式字段。
的 `cm-resource-highlight-*` 样式。生成规则使用独立的 `generateHighlightPrompt`，通过 `{{name}}` 和
`{{content}}` 插值；请求使用 JSON Schema 校验和有限重试，遇到 `Unexpected end of JSON input` 等不完整 JSON
时会要求模型重新输出。重试过程中的旧输出不会和新输出拼接；规则生成失败时不得覆盖已有规则。

Workspace 存储结构与 `state`、`jobs`、`keys` 独立，实际设置按 Application ID 保存：

```json
{
  "chat": {
    "model": "deepseek-chat",
    "temperature": 0.7,
    "thinking": true
  }
}
```

Workspace 启动时加载独立的 custom-settings 资源，根据每个 Application 的 `schema()` 补齐默认值并校验。
设置页面遍历 Application 的 Schema，自动渲染通用控件，并通过 Workspace 的更新接口保存修改。新增
Application 后，只要提供 `schema()`，就可以自动出现在设置页面。

用于创建 `JobRequest` 的函数必须从 Application Model 中单独提取到专用文件。Application 将 Workspace
已加载的 customSetting 和业务数据传给请求工厂：

```js
const request = createChatJobRequest({
  messages,
}, this.workspace.getCustomSettings(this.id))
```

请求工厂将业务输入对象和 `customSetting` 作为独立参数接收，根据 `customSetting` 生成通用请求参数，再补充
`messages` 等 Application 业务字段。它不访问
Workspace、不选择 API Key、不启动 Job。设置修改只影响之后创建的 Job，已经创建的 Job 使用自己的请求快照。

推荐的调用边界为：

```text
Application 请求工厂
  -> 接收业务输入对象、customSetting
  -> 生成最终 JobRequest
Workspace.createJob()
  -> 交给 JobManager 创建并启动 Job
```

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
8. 如果 Application 有 Workspace 级设置，实现静态 `schema()`；Workspace 设置页会自动加载并渲染
9. 如果 Application 创建 Job，将 `createXXXJobRequest()` 单独放在 Application 目录中，并接收 `customSetting`

## 开发约定

- **Application Model 保持纯 JS**，不含 Vue API（ref/reactive/computed），保持可测试性
- View 组件只做 UI 编排和事件转发，不包含业务逻辑
- Section 组件尽可能轻量，只做侧边栏导航
- 目录名、id、stateKey 必须一致，使用全小写英文
- 若有独有 UI 组件，放在该 Application 目录下的 `ui/` 中
- 各 Application 的状态互不依赖，不应读写其他 Application 的 stateKey
- `App.vue` 的 view 路由使用 application id 作为 view name（如 `view === 'chat'`）
- JobRequest 的生成逻辑必须独立成文件，Application Model 只负责准备业务输入并调用请求工厂
- Workspace 级 `customSettings` 使用独立后端资源，不放入 `WorkspaceState`，也不能通过通用 Store API 绕过设置接口
- `schema()` 只声明设置字段，不保存运行时值；运行时值由 Workspace 按 Application ID 管理
- Application 创建 Job 后必须持久化业务对象与 `jobId` 的关联，不能只保存在内存中
- Job 订阅必须可去重、可取消，不能因为重复调用 `revive()` 产生重复 delta 或订阅泄漏
