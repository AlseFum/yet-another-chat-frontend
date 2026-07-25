/**
 * API 层：REST 调用 + 工作区路由
 * ==============================
 * 从 URL 第一段解析工作区名（/aaa → aaa，/ → default），
 * 内部拼出 /api/{workspace}/{kind} 路径。
 * 调用方直接用 apiGet('convs')，不用关心工作区。
 */

function getWorkspace() {
  const seg = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  return seg[0] && seg[0] !== 'api' ? seg[0] : 'default'
}

const WS = getWorkspace()

export { getWorkspace }

export function apiGet(kind) {
  return fetch(`/api/${WS}/${kind}`).then(r => {
    if (!r.ok) throw new Error(`API ${r.status}`)
    return r.json()
  }).catch(() => [])
}

export function apiPut(kind, data) {
  return fetch(`/api/${WS}/${kind}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => {
    if (!r.ok) console.warn(`PUT /api/${WS}/${kind}`, r.status)
  }).catch(() => {})
}

export function apiPost(kind, data) {
  return fetch(`/api/${WS}/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(async r => {
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(body.error || `API ${r.status}`)
    return body
  })
}

export function apiDelete(kind, id) {
  return fetch(`/api/${WS}/${kind}/${id}`, { method: 'DELETE' }).then(async r => {
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(body.error || `API ${r.status}`)
    return body
  })
}

export async function apiSetDefaultApiKey(id) {
  const response = await fetch(`/api/${WS}/api-keys/${encodeURIComponent(id)}/default`, { method: 'PATCH' })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `API ${response.status}`)
  return body
}

export async function apiExportWorkspace() {
  const response = await fetch(`/api/${WS}/export`)
  if (!response.ok) throw new Error(`导出失败: ${response.status}`)
  return response.json()
}

export async function apiImportWorkspace(data) {
  const response = await fetch(`/api/${WS}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `导入失败: ${response.status}`)
  return body
}

export async function apiLLM(credentialId, body, signal) {
  const res = await fetch(`/api/${WS}/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialId, body }),
    signal,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || `API ${res.status}`)
  }
  return res
}
