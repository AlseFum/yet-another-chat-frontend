export function createWorkspaceFixture() {
  return {
    id: 'atelier',
    name: 'Atelier',
    conversations: [
      {
        id: 'chat-product',
        name: '产品推演',
        messages: [
          { id: 'm1', role: 'user', content: '把这组零散需求整理成一条可以执行的产品路径。' },
          {
            id: 'm2',
            role: 'assistant',
            reasoning: '先区分不可逆的架构约束与可以延迟的体验决策，再按依赖排序。',
            content: '建议先完成工作台外壳与主题契约，再接入 Application 生命周期。这样界面不会绑死数据实现，后续每个能力可以独立落地。',
          },
          {
            id: 'm3',
            role: 'tool',
            toolCall: { name: 'inspect_workspace', arguments: { depth: 2 } },
            toolResult: '2 applications, 6 resources',
          },
          { id: 'm4', role: 'assistant', content: 'Workspace 结构已确认。下一步可以把验收标准拆到各阶段。' },
        ],
      },
      { id: 'chat-notes', name: '研究笔记', messages: [{ id: 'm5', role: 'user', content: '记录今天的观察。' }] },
      { id: 'chat-empty', name: '新对话', messages: [] },
    ],
    resources: {
      text: [
        { id: 'text-principles', name: '设计原则', content: '# 设计原则\n\n界面服从信息结构，动效帮助建立空间关系。' },
        { id: 'text-context', name: '项目背景', content: '这是一个由多个独立 Application 组成的本地工作台。' },
      ],
      preset: [
        { id: 'preset-editor', name: '严谨编辑', content: '你是一名严谨的编辑。先识别事实，再指出缺口，最后给出最小修改。', temperature: '0.4', maxTokens: '4096' },
        { id: 'preset-brief', name: '快速简报', content: '将输入整理为背景、发现、风险和下一步。', temperature: '0.7', maxTokens: '2048' },
      ],
      tool: [
        { id: 'tool-fetch', name: 'fetch_page', description: '读取指定页面并返回正文。', content: "const response = await ctx.fetch(ctx.args.url)\nreturn await response.text()" },
        { id: 'tool-calc', name: 'calculate', description: '执行受控的数值计算。', content: 'return Number(ctx.args.left) + Number(ctx.args.right)' },
      ],
    },
    keys: [
      { id: 'key-main', name: 'Primary Gateway', provider: 'openai-compatible', endpoint: 'https://api.example.com/v1', isDefault: true },
      { id: 'key-lab', name: 'Lab', provider: 'anthropic-messages', endpoint: 'https://gateway.example.net', isDefault: false },
    ],
    jobs: [
      { id: 'job-a8f2', source: 'chat:产品推演', status: 'completed', location: '服务端托管', model: 'deepseek-chat', createdAt: '2026-07-28 21:14', output: '建议先完成工作台外壳与主题契约。' },
      { id: 'job-c120', source: 'chat:研究笔记', status: 'running', location: '服务端托管', model: 'gpt-4.1-mini', createdAt: '2026-07-28 21:19', output: '' },
      { id: 'job-f773', source: 'resource:严谨编辑', status: 'failed', location: '浏览器直连', model: 'claude-sonnet', createdAt: '2026-07-28 20:56', output: 'Provider timeout' },
    ],
  }
}
