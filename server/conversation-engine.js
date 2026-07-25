import { JobRequest } from '../llm/index.js'

/**
 * Server-side conversation orchestration. This layer coordinates persisted
 * conversations, streaming LLM jobs, optional tool calls, and WebSocket-style
 * publish events. It is intentionally separate from LLMJob, which only knows
 * how to execute one provider request.
 */
function parseToolCall(content) {
  try {
    const match = content.match(/```tool\n([\s\S]*?)```/)
    const value = match && JSON.parse(match[1])
    return value?.name && value.args !== undefined ? value : null
  } catch { return null }
}

function toolPrompt(tools) {
  if (!tools.length) return ''
  const list = tools.map(tool => `- ${tool.name}: ${tool.desc}`).join('\n')
  return `你可以通过以下格式调用工具。一次调用一个。\n\n\`\`\`tool\n{"name":"<工具名>","args":{...}}\n\`\`\`\n\n可用工具：\n${list}`
}

function expandTextMentions(content, texts) {
  // Mentions are expanded only in the request sent to the model; stored user
  // messages retain the compact reference syntax.
  return String(content || '').replace(/@\[([^\]\r\n]+)]/g, (mention, name) => {
    const text = texts.find(item => item.name === name)
    return text ? `[引用文本：${text.name}]\n${text.content}\n[/引用文本]` : mention
  })
}

async function readError(stream) {
  const decoder = new TextDecoder()
  let text = ''
  for await (const value of stream) text += decoder.decode(value, { stream: true })
  return text
}

async function executeTool(tool, args, texts, conv) {
  if (!tool) return '工具未找到'
  try {
    const ctx = {
      args,
      fetch,
      texts,
      conv: {
        model: conv.model,
        temperature: conv.temperature,
        maxTokens: conv.maxTokens,
        messages: conv.messages.map(({ role, content }) => ({ role, content })),
      },
    }
    const result = await new Function('ctx', `return (async () => {\n${tool.code}\n})()`)(ctx)
    return typeof result === 'string' ? result : JSON.stringify(result)
  } catch (error) { return `执行错误: ${error.message}` }
}

export function createConversationEngine(store, publish, jobs) {
  const running = new Map()
  const keyFor = (workspace, convId) => `${workspace}:${convId}`

  function snapshot(workspace, conv) {
    publish(workspace, { type: 'snapshot', convId: conv.id, conversation: conv, loading: running.has(keyFor(workspace, conv.id)) })
  }

  async function persist(workspace, conversations) {
    await store.write(workspace, 'convs', conversations, { immediate: true })
  }

  async function start(workspace, convId, text) {
    const key = keyFor(workspace, convId)
    if (running.has(key)) throw new Error('该对话正在生成')
    const conversations = store.read(workspace, 'convs')
    const conv = conversations.find(item => item.id === convId)
    if (!conv) throw new Error('对话不存在')
    if (!conv.apiKeyId) throw new Error('请先为对话选择有效的 API Key')
    const texts = store.read(workspace, 'texts')
    const tools = store.read(workspace, 'tools')
    const controller = new AbortController()
    running.set(key, { controller, conv })
    conv.messages ||= []
    conv.messages.push({ role: 'user', content: text })
    await persist(workspace, conversations)
    snapshot(workspace, conv)

    try {
      const system = [toolPrompt(tools), expandTextMentions(conv.sysPrompt, texts)].filter(Boolean).join('\n\n')
      const base = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...conv.messages.map(({ role, content }) => ({ role, content: role === 'user' ? expandTextMentions(content, texts) : content })),
      ]
      const toolMessages = []
      // A model response may request another tool. Bound the loop to prevent a
      // malformed or over-eager model from creating unbounded work.
      for (let attempt = 0; attempt < 5; attempt++) {
        const index = conv.messages.length
        const assistant = { role: 'assistant', content: '', rawContent: '', cot: null, thoughts: [], temp: false }
        conv.messages.push(assistant)
        snapshot(workspace, conv)
        const body = {
          model: conv.model,
          messages: [...base, ...toolMessages],
          temperature: Number.isFinite(Number(conv.temperature)) ? Number(conv.temperature) : 0.7,
          max_tokens: parseInt(conv.maxTokens) || 4096,
          stream: true,
        }
        const upstream = await jobs.submit({
          workspace, credentialId: conv.apiKeyId,
          request: new JobRequest({ messages: body.messages, model: body.model, temperature: body.temperature, maxTokens: body.max_tokens, stream: true }).toJSON(),
          source: 'chat', context: { conversationId: convId }, signal: controller.signal,
        })
        const unsubscribe = upstream.job.subscribe(event => {
          if (event.type !== 'delta') return
          assistant.content += event.content || ''
          assistant.rawContent += event.content || ''
          if (event.reasoning) {
            assistant.cot = `${assistant.cot || ''}${event.reasoning}`
            assistant.thoughts = [assistant.cot]
          }
          // createLLMJobManager publishes the same delta with this Job's
          // conversation context. The client routes that JobMirror event into
          // the visible assistant message without duplicating transport data.
        })
        let result
        try { result = await upstream.result } finally { unsubscribe() }
        Object.assign(assistant, result)
        const call = parseToolCall(result.content)
        if (!call) break
        assistant.content = `调用工具: ${call.name}`
        assistant.toolCall = call
        publish(workspace, { type: 'tool-call', convId, index, name: call.name, args: call.args })
        assistant.toolResult = await executeTool(tools.find(tool => tool.name === call.name), call.args, texts, conv)
        await store.write(workspace, 'texts', texts, { immediate: true })
        publish(workspace, { type: 'tool-result', convId, index, name: call.name, result: assistant.toolResult })
        toolMessages.push({ role: 'assistant', content: result.content }, { role: 'user', content: `[工具 ${call.name} 结果]\n${assistant.toolResult}` })
      }
      await persist(workspace, conversations)
      publish(workspace, { type: 'done', convId })
    } catch (error) {
      // Preserve a visible terminal message for both request failures and user
      // cancellation, then publish the matching state transition.
      const message = error.name === 'AbortError' ? '[已停止]' : `请求失败: ${error.message}`
      const last = conv.messages.at(-1)
      if (last?.role === 'assistant') last.content += last.content ? `\n\n${message}` : message
      await persist(workspace, conversations)
      publish(workspace, { type: error.name === 'AbortError' ? 'done' : 'error', convId, message })
    } finally {
      running.delete(key)
      snapshot(workspace, conv)
    }
  }

  return {
    start,
    stop(workspace, convId, reason = 'user-stop') {
      const controller = running.get(keyFor(workspace, convId))?.controller
      controller?.abort(new DOMException(reason, 'AbortError'))
    },
    snapshot(workspace, convId) {
      const conv = running.get(keyFor(workspace, convId))?.conv || store.read(workspace, 'convs').find(item => item.id === convId)
      if (conv) snapshot(workspace, conv)
    },
  }
}
