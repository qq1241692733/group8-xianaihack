import { create } from 'zustand'

import { buildScript, type ScriptReply } from '@/data/script'
import { seedIfEmpty } from '@/data/seed'
import { buildScriptContext } from '@/features/agent/context'
import { enqueueNode } from '@/features/agent/queue'
import type { AiMessage, QueuedItem } from '@/features/agent/types'
import { addEntry as persistEntry, listEntries } from '@/features/memory/repo'
import type { Entry, EntryDraft } from '@/features/memory/types'
import { createId } from '@/lib/id'

export type Pane = 'moment' | 'time' | 'ai'
export type OverlayId = 'nothing' | 'capture' | 'focus'

/** 点击选项后到分支第一句之间的停顿。参考稿是 setTimeout(it.go, 700)。 */
const REPLY_LEAD_MS = 700

type Store = {
  pane: Pane
  overlay: OverlayId | null
  toast: string | null
  entries: Entry[]
  /** 只在本次会话里新留下的。「此刻」页那条虚线只看它，且它不进任何统计。 */
  captured: Entry[]
  refuseCount: number
  hydrated: boolean
  /** hydrate 那一刻取的时间锚点。7 天窗口以它为起点，不每帧现取。 */
  hydratedAt: number
  /**
   * 「理解」的对话必须等你第一次点开这个 Tab 才开始。
   *
   * 原单文件版是进 App 就无条件跑完（index_demo.html:1222），现场演示点进「理解」
   * 只剩结尾，第三幕的转折全没了。这是 P0 修正。
   */
  aiStarted: boolean
  /** 队列是否已按真实记忆构建过。只做一次。 */
  aiBegun: boolean
  aiMessages: AiMessage[]
  /** 待浮现。留在 store 里 → 切 Tab 不丢、可以续播。 */
  aiQueue: QueuedItem[]
  /** 当前可点的选项；空 = 不可选。 */
  aiReplies: ScriptReply[]

  goPane: (pane: Pane) => void
  openOverlay: (id: OverlayId) => void
  closeOverlay: () => void
  showToast: (message: string) => void
  refuse: () => void
  hydrate: () => Promise<void>
  capture: (draft: EntryDraft) => Promise<Entry>
  startAi: () => void

  aiBegin: () => void
  aiCommitHead: () => void
  aiChooseReply: (reply: ScriptReply) => void
  aiAppend: (message: AiMessage) => void
}

let toastTimer: number | undefined

export const useStore = create<Store>((set, get) => ({
  pane: 'moment',
  overlay: null,
  toast: null,
  entries: [],
  captured: [],
  refuseCount: 0,
  hydrated: false,
  hydratedAt: 0,
  aiStarted: false,
  aiBegun: false,
  aiMessages: [],
  aiQueue: [],
  aiReplies: [],

  goPane: (pane) => {
    set({ pane })
    if (pane === 'ai') get().startAi()
  },

  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set({ overlay: null }),

  showToast: (message) => {
    set({ toast: message })
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => set({ toast: null }), 2400)
  },

  refuse: () => set((s) => ({ refuseCount: s.refuseCount + 1 })),

  hydrate: async () => {
    await seedIfEmpty()
    set({ entries: await listEntries(), hydrated: true, hydratedAt: Date.now() })
  },

  capture: async (draft) => {
    const entry = await persistEntry(draft)
    set((s) => ({ entries: [entry, ...s.entries], captured: [entry, ...s.captured] }))
    return entry
  },

  startAi: () => {
    if (get().aiStarted) return
    set({ aiStarted: true })
  },

  /**
   * 用真实记忆把整场戏组好，一次入队。
   *
   * 之后新记的条目不会回改已经说出口的那句话——那句话说的是它说出口那一刻的事实。
   * 想更新得从头演一遍（刷新页面）。
   */
  aiBegin: () => {
    if (get().aiBegun) return
    const { entries, hydratedAt } = get()
    const ctx = buildScriptContext(entries, hydratedAt)
    set({
      aiBegun: true,
      aiMessages: [],
      aiReplies: [],
      aiQueue: enqueueNode(buildScript(ctx).opening, ctx),
    })
  },

  /** 弹出队首并落下。选项/按钮落成状态，其余落成一条消息。 */
  aiCommitHead: () => {
    const [head, ...rest] = get().aiQueue
    if (!head) return

    if (head.kind === 'replies') {
      set({ aiQueue: rest, aiReplies: head.replies })
      return
    }

    if (head.kind === 'action') {
      set((s) => ({
        aiQueue: rest,
        aiMessages: [...s.aiMessages, { id: createId('m'), kind: 'action' }],
      }))
      return
    }

    if (head.kind === 'card') {
      set((s) => ({
        aiQueue: rest,
        aiMessages: [...s.aiMessages, { id: createId('m'), kind: 'card', card: head.card }],
      }))
      return
    }

    set((s) => ({
      aiQueue: rest,
      aiMessages: [...s.aiMessages, { id: createId('m'), kind: 'ai', line: head.line }],
    }))
  },

  aiChooseReply: (reply) => {
    // 同一次写入里清空 aiReplies：第二次点击读到长度为 0，直接返回。
    // 这就是防连点的护栏——选项从来不靠 DOM 消失来防重入。
    if (get().aiReplies.length === 0) return

    const { entries, hydratedAt } = get()
    const ctx = buildScriptContext(entries, hydratedAt)
    const node = buildScript(ctx)[reply.go]

    set((s) => ({
      aiReplies: [],
      aiMessages: [...s.aiMessages, { id: createId('m'), kind: 'me', text: reply.label }],
      aiQueue: [...s.aiQueue, ...enqueueNode(node, ctx, REPLY_LEAD_MS)],
    }))
  },

  aiAppend: (message) => set((s) => ({ aiMessages: [...s.aiMessages, message] })),
}))
