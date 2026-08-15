# Yet Another Agent
> 此项目与DeepseekHarness功能重复，停止开发。

一个以 Job 为核心的 LLM 工作台：把对话、Persona、工具、Workflow 和 Talk
组织在同一个 Workspace 中，并支持浏览器直连和服务端代理两种执行方式。

项目仍在快速迭代中。当前最适合用于个人部署、实验和构建 LLM 应用原型；
不要在没有审查存储、API Key 和工具执行权限的情况下直接用于生产环境。

## Features

- Raw Chat：直接编写 System Prompt，并可选择受限 Tool 进行多轮调用。
- Single Chat：一个 Persona 对应一个对话角色，使用干净的一对一消息历史。
- Multi Chat：多个 Persona 实例并行回复；同一个 Persona 可以通过实例别名复用。
- Persona Resource：按 section 组织身份、目标、原则、能力和交流方式，并支持 Text 引用。
- Outlook section：多人模式下只向其他角色提供外观摘要，不暴露完整 Persona 设定。
- Orchestrator：通过 Action Contract、输入/输出 Schema 和 Tool 权限规划一轮行动。
- Workflow：拓扑执行节点、条件分支和 Job 结果持久化。
- Talk：面向长期状态、记忆和计划的沉浸式交互实验。
- Job runtime：流式输出、reasoning、验证、重试、取消、服务端持久化和刷新恢复。
- Workspace：隔离每个 workspace 的 State、Key、Resource 和 Job。

## Quick Start

要求 Node.js 22 或更高版本。

```sh
npm install
npm run start
```

打开 `http://localhost:1146/default`。首次使用时可以在 Web UI 的 API Keys 页面配置凭据。

也可以通过环境变量注入一个启动 Key：

```sh
WORKSPACE=default \
LLM_API_KEY=your-api-key \
LLM_BASE_URL=https://api.deepseek.com/v1 \
LLM_PROVIDER=openai-compatible \
npm run backend
```

前端开发服务器：

```sh
npm run web:dev
```

## Core API

```js
import { JobRequest, LLMKey, launch } from './llm/index.js'

const job = launch(
  new JobRequest({
    model: 'your-model',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
  new LLMKey({
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL,
  }),
)

const subscription = job.onEvent(event => {
  if (event.type === 'delta') process.stdout.write(event.content)
})

const result = await job.result
subscription.unsubscribe()
```

`launch(request, key)` 创建并返回一个带 `nanoid` ID、初始状态为 `idle` 的 `LLMJob`。使用 `job.abort()` 取消它；Job 生命周期和流事件通过 RxJS `Subject` 发布：`idle`、`running`、`streaming`、`delta`、`validating`、`completed`、`failed`、`cancelled`。

默认使用流式响应。传入 `stream: false` 可关闭流式，Job 会在响应完整到达后发布一次 `delta`，并从 `running` 直接进入 `validating`。

`job.toJSON()` 返回可持久化的历史快照，包含请求参数、结果、reasoning 和每次尝试，但不包含 API Key、事件流、Promise 或取消机制。运行中的 Job 只能作为历史快照展示，不能从 JSON 恢复执行。

调用方决定在浏览器还是服务端调用 `launch`；核心本身不管理会话、持久化、代理路由或 API Key 存储。

## Repository Layout

```text
application/  纯 Application 状态与通用 Job 关联模型
tui/client/   TUI 专用的 KeyRef、JobManager、Client、HTTP/SSE/WS transport
backend/      按 workspace 持久化 Key/State/Job，以及 JobManager、Service、HTTP/SSE/WS transport
llm/          Provider 无关的单次 LLM Job 核心
web/          Vue 工作台 UI、Workspace 模型和 Applications
tui.js        终端前端测试入口
```

`KeyRef.temporary(key)` 表示仅前端内存中的临时 Key；`KeyRef.server(keyId)` 只传递后端 Key ID，不含 API Key。

## Runtime Model

业务 Application 不直接操作 Provider 或后端 Job API，而是通过以下边界运行：

```text
Application
  -> createXXXJobRequest(input, customSettings)
  -> Workspace.createJob({ request, keyRef, metadata, onCreated, onEvent })
  -> JobManager
  -> direct browser Job or server Job
```

Conversation、Workflow 和 Talk 只持久化必要的 `jobId` 与业务状态；Job 快照负责保存
请求、输出、reasoning、尝试记录和终态。服务端 Job 可以在刷新后恢复，临时浏览器 Key
创建的 direct Job 只在当前页面生命周期内有效。

更多边界说明见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 和
[`web/src/applications/SPEC.md`](web/src/applications/SPEC.md)。

## Web UI

```sh
npm run web:dev
npm run web:check-theme
npm run web:build
```

执行 `npm run web:build` 后，后端会托管 `web/dist`：

生产启动使用：

```sh
npm run start
```

该命令会先构建 Web，再持续监听前端和后端：修改 `web/` 后 Vite 会重新构建 `web/dist`，但不会重启后端；修改 `backend/`、`llm/` 或 `util/` 后，服务端才会自动重启。按 `Ctrl+C` 会同时停止两个进程。

```text
http://localhost:1146/default
```

开发时仍可使用 Vite：

```text
http://localhost:5173/default
```

Web Chat 的 Job 派发分为两种：服务端 KeyRef 将 `keyId` 和 `JobRequest` 发给后端；临时 KeyRef 则由浏览器直接调用 Provider，明文 Key 只存在当前页面内存，不进入 State、后端 Key 或 Job 快照。

## Tests and Checks

```sh
npm run test:applications
npm run web:check-theme
npm run web:build
```

提交前至少运行上述三项。构建产生的 `web/dist`、运行时 workspace 数据和日志不应提交。

## TUI

后端按 workspace 隔离 Key、Application State 和 Job。可直接启动，再由 TUI 为 workspace 创建 Key：

```sh
npm run backend
```

也可以通过 `WORKSPACE`、`LLM_API_KEY` 和 `LLM_KEY_ID` 在启动时为一个 workspace 注入 bootstrap Key。

另一个终端启动 TUI：

```sh
npm run tui
```

TUI 启动时会要求选择 workspace，`WORKSPACE` 环境变量仅提供默认值。随后可选择该 workspace 已有的服务端 Key；新 workspace 没有 Key 时，TUI 会引导创建。输入任意文本会创建 server Job。TUI 从所选 workspace 加载 Application 与 Job 历史，通过 HTTP 创建/加载 Job、通过 SSE 接收正文和 reasoning 流、通过 WebSocket 发送 `job abort <jobId>`。

后端默认将每个 workspace 独立保存到仓库根目录的 `data/<workspace>.json`，不受启动目录影响；可通过 `DATA_DIR` 修改目录。内部 `keys` 和 `jobs` 必须是以 ID 为键的 JSON 对象，不兼容旧数组格式。

TUI 可以任意读写当前 workspace 的 JSON Store：

```text
store                              # 读取整个 Store
store list                         # 列出顶层名称
store get <name>                   # 读取一个值
store set <name> <json>            # 写入任意 JSON 值
store patch <name> <json>          # 递归更新嵌套字段
store delete <name>                # 删除一个值
store replace <json-object>        # 覆盖整个 Store
```

`store replace` 会同时覆盖 `state`、`keys` 和 `jobs`，仅用于管理和测试。

`store patch` 使用 JSON Merge Patch：对象递归合并，`null` 删除字段，数组和其他值整体替换。

通用 Store API 不允许读取、修改或删除内部 `key/keys` 命名空间；API Key 只能通过专用的 `key` API 管理。

Job 默认在 TUI 后台运行，创建后立即返回 Job ID：

```text
run <prompt>
job list
job show <jobId|@->
job abort <jobId|@->
job clean <jobId|@->
```

`@-` 表示最近创建的 Job ID，例如 `job abort @-`。`job clean` 只允许清理终态 Job，并同时删除后端快照和 Application 中的 Job ID。

使用 `help` 查看所有 TUI 命令，使用 `clear` 清空终端。

后台 Job 完全静默，不会自动打印状态、正文或 reasoning。创建时只返回 Job ID；使用 `job list` 或 `job show @-` 主动查看。

TUI 在当前进程中保留最近 1000 条输入，可使用上/下方向键重复命令或 prompt。Workspace 与 Key 初始化输入会在进入主提示符前从历史中清除。

TUI 主输入提示符为 `: `。

## Security Notes

- 不要提交 `data/`、API Key、Provider token 或真实对话记录。
- Raw Tool 使用资源代码执行能力；只启用自己审查过的 Tool。
- 浏览器临时 Key 不写入 Workspace State，但浏览器环境本身不应视为可信执行环境。
- 服务端 Key 只通过 Key ID 传输给后端，API Key 不应进入 JobRequest 或 Job snapshot。
- User Mask、Persona Prompt、Outlook 和 Action Contract 具有不同的可见范围；修改 Prompt 组装逻辑时必须保持隔离。

## Contributing

请先阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。项目当前优先保证运行边界、数据隔离和 Job 恢复正确，再扩展 UI 功能。
