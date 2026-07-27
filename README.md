# LLM Core

一个不依赖前端、后端、存储或会话实现的流式 LLM Job 核心。

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

调用方决定在浏览器还是服务端调用 `launch`；核心本身不管理会话、Job 持久化、代理路由或 API Key 存储。

## Real API Test

`test.js` 使用开启深度思考的 `deepseek-v4-flash` 向配置的真实 Provider 发起 gzip 协商的流式请求。它会故意让第一次校验失败，以确认 schema validator、reasoning delta 和携带上次结果进行自审的第二次 retry 请求均正常工作。

```sh
npm run test:llm
```

测试 API 配置直接放在 `test.js` 中。
