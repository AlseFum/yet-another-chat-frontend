# DS Chat

一个本地优先的 LLM 工作台。DS Chat 将多轮对话、提示词与工具编辑、可视化工作流、分阶段写作（Talk）和 LLM 任务记录放在同一个 Vue 应用中，并通过本地 JSON 文件保存工作区数据。

![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-LTS-339933?logo=nodedotjs&logoColor=white)

## 功能

- 多会话聊天，支持流式输出、Markdown 渲染、思维过程展开，以及编辑、删除或从历史消息重新编辑。
- API Key 管理，支持 OpenAI 兼容接口、可用模型配置和唯一默认 Key；密钥只保存在服务器本地数据目录。
- 文本、工具和预设编辑器，提供 CodeMirror 编辑体验，并可由 LLM 协助生成内容。
- 可视化工作流，内置输入、文本、提示词、工具、条件、调试和输出节点；支持工作流插值和逐节点运行状态。
- Talk 分阶段创作空间，围绕会话整理状态、计划和运行信息。
- LLM Job 记录，可查看请求、验证/重试及 Provider 尝试结果。
- 工作区导入与导出，涵盖会话、Talk、文本、工具、预设和工作流。
- 深色/浅色主题和移动端适配。

## 技术栈

- 前端：Vue 3、Vite、Vue Flow、CodeMirror
- 后端：Express、WebSocket
- LLM：OpenAI 兼容 Provider，支持服务端代理和流式响应
- 存储：本地 JSON 文件

## 快速开始

需要安装当前 LTS 版本的 Node.js 和 npm。

```sh
git clone <your-repository-url>
cd myagent
npm install
npm run build
npm run start:once
```

打开 [http://localhost:1145](http://localhost:1145)，然后在“API Key”页面添加一个 OpenAI 兼容服务的地址、密钥和模型。第一个创建的 Key 会自动成为默认 Key。

默认端口是 `1145`。可通过环境变量修改：

```sh
PORT=3000 npm run start:once
```

## 开发

分别启动后端和 Vite 开发服务器：

```sh
# 终端 1：后端，监听 web/src 变化并重新构建
npm start

# 终端 2：前端开发服务器
npm run dev
```

访问 Vite 输出的本地地址（通常是 [http://localhost:5173](http://localhost:5173)）。Vite 已将 `/api` 和 `/ws` 代理至 `http://localhost:1145`。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 前端开发服务器 |
| `npm run build` | 构建前端到 `web/dist` |
| `npm start` | 启动后端并监听服务端与前端源码变化 |
| `npm run start:once` | 启动不带文件监听的后端服务 |
| `npm run test:workflow` | 运行工作流插值、节点放置和 Talk 时间处理测试 |

## 数据与安全

应用数据保存在 `data/`，包括工作区资源和 API Key。该目录已在 `.gitignore` 中排除，不会被提交到仓库；但其内容包含明文 API Key，应妥善备份并限制本机访问权限。

项目默认面向受信任的本地环境：没有内置用户认证、访问控制或加密存储。将服务暴露到公网前，需要自行在反向代理或部署层补充身份验证、HTTPS 和访问限制。

## 项目结构

```text
web/       Vue + Vite 前端
server/    Express API、WebSocket 和 JSON 存储
llm/       Provider、请求任务、流式传输和 Talk 提示词
util/      Result、队列、互斥锁和流等通用工具
data/      本地工作区数据（运行时生成，不提交）
```

## 许可证

当前仓库尚未声明许可证。在公开发布前，请添加适合项目分发方式的 `LICENSE` 文件。
