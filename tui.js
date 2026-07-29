import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Application } from './application/application.js'
import { FrontendClient } from './tui/client/client.js'
import { FrontendJobManager } from './tui/client/job-manager.js'
import { KeyRef } from './tui/client/key-ref.js'
import { HttpSseWsTransport } from './tui/client/transport.js'
import { JobRequest } from './llm/index.js'

const input = createInterface({
  input: stdin,
  output: stdout,
  prompt: ': ',
  terminal: Boolean(stdin.isTTY && stdout.isTTY),
  historySize: 1000,
  removeHistoryDuplicates: false,
})
const defaultWorkspace = process.env.WORKSPACE || 'default'
let workspace
while (!workspace) {
  const answer = (await input.question(`Workspace [${defaultWorkspace}]: `)).trim() || defaultWorkspace
  if (/^[a-zA-Z0-9_-]+$/.test(answer)) workspace = answer
  else stdout.write('Workspace 只能包含字母、数字、下划线和连字符。\n')
}
const transport = new HttpSseWsTransport(process.env.BACKEND_URL || 'http://localhost:1146', workspace)
try {
  await transport.connect()
} catch (error) {
  input.close()
  throw new Error(`无法连接 workspace "${workspace}"：${error.message}。请确认后端已使用最新代码重启。`)
}

const client = new FrontendClient(transport)
const jobs = new FrontendJobManager(client)
const application = new Application(await client.loadState() || {})
await jobs.load(application.jobs)

async function selectKey() {
  const keys = await client.listKeys()
  if (keys.length) {
    stdout.write('可用服务端 Key：\n')
    for (const item of keys) stdout.write(`- ${item.id} (${item.provider}, ${item.baseUrl})\n`)
    while (true) {
      const keyId = (await input.question(`Key [${keys[0].id}]: `)).trim() || keys[0].id
      if (keys.some(item => item.id === keyId)) return KeyRef.server(keyId)
      stdout.write(`Key ${keyId} 不存在。\n`)
    }
  }

  stdout.write(`Workspace "${workspace}" 尚无服务端 Key，请创建。\n`)
  const id = (await input.question('Key ID [deepseek]: ')).trim() || 'deepseek'
  const apiKey = (await input.question('API Key: ')).trim()
  if (!apiKey) throw new Error('API Key 不能为空')
  const baseUrl = (await input.question('Base URL [https://api.deepseek.com/v1]: ')).trim() || 'https://api.deepseek.com/v1'
  const provider = (await input.question('Provider [openai-compatible]: ')).trim() || 'openai-compatible'
  const saved = await client.saveKey({ id, apiKey, baseUrl, provider })
  return KeyRef.server(saved.id)
}

const key = await selectKey()
// Do not expose workspace selection or API Key setup through command history.
input.history?.splice(0)
let latestJobId = application.jobs.at(-1) || null

function printHelp() {
  stdout.write(`
命令：
  run <prompt>                     创建后台 Job
  job list                        列出 Job
  job show <jobId|@->             查看 Job 快照
  job abort <jobId|@->            取消运行中的 Job
  job clean <jobId|@->            清理终态 Job
  store                           读取整个 Store
  store list                      列出 Store 名称
  store get <name>                读取 Store 值
  store set <name> <json>         覆盖 Store 值
  store patch <name> <json>       Merge Patch Store 值
  store delete <name>             删除 Store 值
  store replace <json-object>     覆盖整个 Store
  clear                           清空终端
  help                            显示帮助
  quit                            退出

  @- 表示最近创建的 Job ID。
`)
}

function resolveJobId(value) {
  if (value !== '@-') return value
  if (!latestJobId) throw new Error('还没有最新 Job')
  return latestJobId
}

function runInBackground(text) {
  const job = jobs.create(new JobRequest({
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    messages: [{ role: 'user', content: text }],
    thinking: true,
    maxTokens: 1024,
  }), key)
  latestJobId = job.id
  application.addJob(job.id)
  stdout.write(`[${job.id}] 已在后台创建，可使用 job abort ${job.id} 或 job abort @-\n`)
  void (async () => {
    try {
      await client.saveState(application.toJSON())
      await jobs.startServer(job.id)
    } catch (error) {
      application.removeJob(job.id)
      await client.saveState(application.toJSON()).catch(() => {})
      job.apply({ status: 'failed', error: error.message, completedAt: new Date().toISOString() }, { jobId: job.id, type: 'state', state: 'failed' })
      stdout.write(`\n[${job.id}] 创建失败：${error.message}\n`)
    }
  })()
  return job
}

async function cleanJob(value) {
  const jobId = resolveJobId(value)
  if (!jobs.get(jobId)) {
    stdout.write(`Job ${jobId} 不存在。\n`)
    return
  }
  await jobs.clean(jobId)
  application.removeJob(jobId)
  await client.saveState(application.toJSON())
  if (latestJobId === jobId) latestJobId = jobs.list().at(-1)?.id || null
  stdout.write(`Job ${jobId} 已清理。\n`)
}

async function handleStoreCommand(command) {
  if (command === 'store') {
    stdout.write(`${JSON.stringify(await client.readAllStore(), null, 2)}\n`)
    return
  }
  if (command === 'store list') {
    const names = await client.listStore()
    stdout.write(`${names.join('\n') || '(empty)'}\n`)
    return
  }
  const get = command.match(/^store\s+get\s+([a-zA-Z0-9_-]+)$/)
  if (get) {
    stdout.write(`${JSON.stringify(await client.readStore(get[1]), null, 2)}\n`)
    return
  }
  const set = command.match(/^store\s+set\s+([a-zA-Z0-9_-]+)\s+([\s\S]+)$/)
  if (set) {
    await client.writeStore(set[1], JSON.parse(set[2]))
    stdout.write(`Store ${set[1]} 已保存。\n`)
    return
  }
  const patch = command.match(/^store\s+patch\s+([a-zA-Z0-9_-]+)\s+([\s\S]+)$/)
  if (patch) {
    const value = await client.patchStore(patch[1], JSON.parse(patch[2]))
    stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    return
  }
  const replace = command.match(/^store\s+replace\s+([\s\S]+)$/)
  if (replace) {
    await client.writeAllStore(JSON.parse(replace[1]))
    stdout.write('整个 Store 已覆盖。\n')
    return
  }
  const remove = command.match(/^store\s+delete\s+([a-zA-Z0-9_-]+)$/)
  if (remove) {
    stdout.write(await client.removeStore(remove[1]) ? `Store ${remove[1]} 已删除。\n` : `Store ${remove[1]} 不存在。\n`)
    return
  }
  stdout.write('用法：store | store list | store get <name> | store set <name> <json> | store patch <name> <json> | store delete <name> | store replace <json-object>\n')
}

jobs.events.subscribe(({ event }) => {
  if (event.type === 'transport.error') {
    stdout.write(`\n连接错误：${event.error}\n`)
    return
  }
})

stdout.write(`Workspace: ${workspace}\n输入 help 查看命令。\n`)
input.prompt()
for await (const line of input) {
  const text = line.trim()
  if (text === 'quit') break
  try {
    if (text === 'help') {
      printHelp()
    } else if (text === 'clear') {
      stdout.write('\x1b[2J\x1b[H')
      stdout.write(`Workspace: ${workspace}\n输入 help 查看命令。\n`)
    } else if (text === 'job list') {
      for (const job of jobs.list()) stdout.write(`${job.id} ${job.status}${job.id === latestJobId ? ' @-' : ''}\n`)
    } else if (text.startsWith('job show ')) {
      const jobId = resolveJobId(text.slice('job show '.length).trim())
      const job = jobs.get(jobId)
      stdout.write(job ? `${JSON.stringify(job.toJSON(), null, 2)}\n` : `Job ${jobId} 不存在。\n`)
    } else if (text === 'store' || text.startsWith('store ')) {
      await handleStoreCommand(text)
    } else if (text.startsWith('job abort ')) {
      const jobId = resolveJobId(text.slice('job abort '.length).trim())
      const job = jobs.get(jobId)
      stdout.write(jobs.abort(jobId) ? `已请求取消 ${jobId}。\n` : job ? `Job ${jobId} 当前为 ${job.status}，无法取消。\n` : `Job ${jobId} 不存在。\n`)
    } else if (text === 'job abort') {
      stdout.write('用法：job abort <jobId|@->\n')
    } else if (text.startsWith('job clean ')) {
      await cleanJob(text.slice('job clean '.length).trim())
    } else if (text === 'job clean') {
      stdout.write('用法：job clean <jobId|@->\n')
    } else if (text.startsWith('run ')) {
      const prompt = text.slice('run '.length).trim()
      if (!prompt) stdout.write('用法：run <prompt>\n')
      else runInBackground(prompt)
    } else if (text === 'run') {
      stdout.write('用法：run <prompt>\n')
    } else if (text.startsWith('job')) {
      stdout.write('用法：job list | job show <jobId|@-> | job abort <jobId|@-> | job clean <jobId|@->\n')
    } else if (text) {
      runInBackground(text)
    }
  } catch (error) {
    stdout.write(`操作失败：${error.message}\n`)
  }
  input.prompt()
}

input.close()
transport.close()
