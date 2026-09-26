import { createId } from '@/lib/id'

import type { AiMessage } from './types'

/**
 * 对话历史。
 *
 * 「理解」里当前那段永远是**活的、未归档的**（在 store 的 aiMessages 里）。点「新增对话」
 * 或从历史里打开另一段时，先把当前这段归档，再换——所以列表里不会出现当前这段的重复项。
 *
 * 存 localStorage 而不是 Dexie，与 composer 草稿同一条边界：它是**界面会话**，
 * 不是记忆记录。记忆记录（entries）才配进库、才有隐私承诺。会话里裹着的册也是同一批
 * Entry（只有 blobRef 字符串），能 JSON 序列化；**Blob 依旧只活在内存里**——
 * 关掉 App 回来，册还在，缩略图会退成场景渐变（与种子照片同一种降级）。
 */

export interface Session {
  id: string
  /** 列表里显示的一行字。第一条你说的话，或第一句它说的话。 */
  title: string
  createdAt: number
  updatedAt: number
  messages: AiMessage[]
}

const SESSIONS_KEY = 'cike:sessions'
/** 上限。超了丢最旧——历史是用来回看的，不是用来囤的。 */
const MAX_SESSIONS = 20

/**
 * 拿到 localStorage，拿不到就返回 null。
 *
 * 不像 composer / llmConfig 那样直接戳 `window.localStorage`：这个模块要在 node 下
 * 被测（测试环境没有 DOM），所以走 globalThis 并包一层——浏览器里它就是 window 的那个。
 */
function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

/** 从消息里取一行标题。不编词：你说过什么就记什么。 */
export function sessionTitle(messages: readonly AiMessage[]): string {
  for (const message of messages) {
    if (message.kind === 'me') {
      const text = message.text.trim()
      if (text) return text.length > 18 ? `${text.slice(0, 18)}…` : text
    }
  }
  for (const message of messages) {
    if (message.kind === 'ai') {
      const text = message.line.parts
        .map((part) => (part.kind === 'break' ? '' : part.text))
        .join('')
        .trim()
      if (text) return text.length > 18 ? `${text.slice(0, 18)}…` : text
    }
  }
  return '没有出声的一段'
}

/** 一段消息 → 一条历史。调用方保证 messages 非空。 */
export function toSession(messages: readonly AiMessage[], id?: string, createdAt?: number): Session {
  const now = Date.now()
  return {
    id: id ?? createId('s'),
    title: sessionTitle(messages),
    createdAt: createdAt ?? now,
    updatedAt: now,
    messages: [...messages],
  }
}

export function loadSessions(): Session[] {
  try {
    const raw = storage()?.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 坏数据不炸：逐条粗验，认不出来的丢掉。
    return parsed.filter(
      (s): s is Session =>
        !!s && typeof s === 'object' && typeof (s as Session).id === 'string' && Array.isArray((s as Session).messages),
    )
  } catch {
    return []
  }
}

export function saveSessions(list: readonly Session[]): void {
  try {
    storage()?.setItem(SESSIONS_KEY, JSON.stringify(list.slice(0, MAX_SESSIONS)))
  } catch {
    // 存储不可用或配额满了：这一段这次会话里还看得到，落不下去就算了。
  }
}

/** 排序不变式：最近更新的一段在最前。 */
export function sortSessions(list: readonly Session[]): Session[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
}

export { MAX_SESSIONS }
