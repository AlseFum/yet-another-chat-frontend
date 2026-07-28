# LLM Application Core

纯 JavaScript LLM Job、Application、前端/后端 JobManager 与传输测试实现。

## API

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

## Modules

```text
application/  纯 Application 状态，当前只保存关注的 Job ID
frontend/     KeyRef、JobManager、Client、HTTP/SSE/WS transport
backend/      按 workspace 持久化 Key/State/Job，以及 JobManager、Service、HTTP/SSE/WS transport
llm/          Provider 无关的单次 LLM Job 核心
web/          独立的 Vue 工作台 UI，目前由内存 fixture 驱动
tui.js        终端前端测试入口
```

`KeyRef.temporary(key)` 表示仅前端内存中的临时 Key；`KeyRef.server(keyId)` 只传递后端 Key ID，不含 API Key。

## Web UI

第一阶段 Web UI 不连接后端，也不复用 TUI 的 Client 或交互模型。它用于验证工作台布局、各 Application 页面、移动端体验以及可替换主题契约。

```sh
npm run web:dev
npm run web:check-theme
npm run web:build
```

完整边界和后续阶段见 [`docs/web-replication-roadmap.md`](docs/web-replication-roadmap.md)。

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
