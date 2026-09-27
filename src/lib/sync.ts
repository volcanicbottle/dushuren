import type { DB } from '@/types'
import { exportAll } from '@/lib/db'

/**
 * GitHub Gist 云同步
 * - 数据整体打包成一个 JSON 文件，存在用户账号下的 secret Gist（不在公开列表，需链接访问）
 * - 策略：最后写入胜出。打开应用自动拉取，本地变更后 5 秒防抖自动上传
 * - token 只授 gist 最小权限，只存在本设备浏览器
 */

const GIST_API = 'https://api.github.com/gists'
const FILE_NAME = 'dushuren-data.json'
const DESC = '读书人应用数据同步（请勿公开分享此 Gist 链接）'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'disabled'

let status: SyncStatus = 'disabled'
let statusMsg = ''
// useSyncExternalStore 的 getSnapshot 必须返回缓存引用，每次新建对象会导致无限重渲染崩溃
let stateSnapshot: { status: SyncStatus; msg: string } = { status, msg: statusMsg }
const listeners = new Set<() => void>()

function setStatus(s: SyncStatus, msg = '') {
  status = s
  statusMsg = msg
  stateSnapshot = { status, msg }
  listeners.forEach((l) => l())
}

export function getSyncState(): { status: SyncStatus; msg: string } {
  return stateSnapshot
}

export function subscribeSync(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

class SyncError extends Error {}

async function req(token: string, method: string, url: string, body?: unknown): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new SyncError('网络连接失败')
  }
  if (res.status === 401 || res.status === 403) throw new SyncError('GitHub Token 无效或权限不足（需要 gist 权限）')
  if (!res.ok) throw new SyncError(`GitHub 接口错误（HTTP ${res.status}）`)
  return res
}

/** 推送：有 gistId 就更新，没有就新建 secret gist，返回 gistId */
export async function pushToGist(token: string, gistId: string, json: string): Promise<string> {
  setStatus('syncing')
  try {
    const body = { description: DESC, public: false, files: { [FILE_NAME]: { content: json } } }
    const res = gistId
      ? await req(token, 'PATCH', `${GIST_API}/${gistId}`, body)
      : await req(token, 'POST', GIST_API, body)
    const data = await res.json()
    setStatus('synced', `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`)
    return data.id as string
  } catch (e) {
    setStatus('error', e instanceof SyncError ? e.message : '同步失败')
    throw e
  }
}

/** 拉取：返回 gist 里的 JSON 字符串，没有则返回 null */
export async function pullFromGist(token: string, gistId: string): Promise<string | null> {
  setStatus('syncing')
  try {
    const res = await req(token, 'GET', `${GIST_API}/${gistId}`)
    const data = await res.json()
    const file = data?.files?.[FILE_NAME]
    setStatus('synced', `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`)
    return file?.content ?? null
  } catch (e) {
    setStatus('error', e instanceof SyncError ? e.message : '拉取失败')
    throw e
  }
}

/** 测试 token：列 gist 验证权限 */
export async function testGithubToken(token: string): Promise<void> {
  await req(token, 'GET', 'https://api.github.com/user')
}

/** 防抖自动推送 */
let timer: ReturnType<typeof setTimeout> | null = null
export function schedulePush(getDB: () => DB, getCreds: () => { token: string; gistId: string }, onNewGist: (id: string) => void) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    const { token, gistId } = getCreds()
    if (!token) return
    try {
      const json = await exportAll(getDB())
      const id = await pushToGist(token, gistId, json)
      if (id !== gistId) onNewGist(id)
    } catch { /* 状态已在 pushToGist 里记录 */ }
  }, 5000)
}

export { setStatus }
