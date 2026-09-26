import { create } from 'zustand'

import {
  addCollection as persistCollection,
  listCollections,
  removeCollection as persistCollectionRemove,
  type Collection,
} from '@/data/collections'
import { cardFromVerdict, buildDiscoveries, clueCardFrom, tagCardFrom, volumeOf, type DiscoveryCard } from '@/data/discoveries'
import { t } from '@/data/script'
import { seedIfEmpty } from '@/data/seed'
import { addWatch as persistWatch, listWatches, removeWatch as persistWatchRemove, seedWatchesIfEmpty, type Watch } from '@/data/watches'
import { candidateGroups, judgeGroup, membersOf } from '@/features/agent/dossier'
import { loadSessions, saveSessions, sortSessions, toSession, type Session } from '@/features/agent/sessions'
import { routeVolumeIntent } from '@/features/agent/volumeIntent'
import type { AiMessage, QueuedItem } from '@/features/agent/types'
import { toVisionDataUrl } from '@/features/capture/imageFeatures'
import { enrichPhotoTags, mergeLlmTags } from '@/features/memory/enrich'
import { collectClueCandidates, collectTagCandidates } from '@/features/memory/query'
import { addEntry as persistEntry, addMoment, listEntries, updateEntryTags } from '@/features/memory/repo'
import type { Entry, EntryDraft, EntryKind } from '@/features/memory/types'
import { createId } from '@/lib/id'

export type Pane = 'moment' | 'time' | 'discover' | 'ai'
export type OverlayId =
  | 'nothing'
  | 'capture'
  | 'settings'
  /** 「记录此刻」：直接写一条（文字 + 标签 + 照片/声音），时间页与发现页的 + 开它。 */
  | 'compose'
  /** 新建合集：起名字 + 挑记录，一步完成。 */
  | 'newCollection'
  /** 守望的设定与管理（从发现页那条「帮我留意」点开）。 */
  | 'watches'
  /** 历史对话（理解页右上角点开）。 */
  | 'history'

/**
 * 「留下此刻」进来时直接落到哪个子视图。
 *
 * 首页的四个方向各自指向一个，所以这里**没有「先选一个」的中转态**：
 * 浮层只会由 openCapture 打开，下面那个初值因此永远不可见，它只是把类型填满。
 */
export type CaptureIntent = 'sound' | 'photo' | 'word'

/**
 * 采到的东西往哪儿去。
 *
 *  - `stage`（默认）：攒着，等首页长按「记录此刻」一起落下——首页那条路。
 *  - `compose`：当作附件，回到「记录此刻」编辑器里（时间页 / 发现页的 + 那条路）。
 */
export type CaptureTarget = 'stage' | 'compose'

/** 「记录此刻」编辑器里的东西。附件是 Blob，只活在这次会话里；正文与标签落 localStorage。 */
export interface ComposerDraft {
  text: string
  tags: string
  attachments: EntryDraft[]
}

const COMPOSER_KEY = 'cike:composer'
const EMPTY_COMPOSER: ComposerDraft = { text: '', tags: '', attachments: [] }

function loadComposer(): ComposerDraft {
  try {
    const raw = window.localStorage.getItem(COMPOSER_KEY)
    if (!raw) return { ...EMPTY_COMPOSER }
    const parsed = JSON.parse(raw) as { text?: unknown; tags?: unknown }
    return {
      text: typeof parsed.text === 'string' ? parsed.text : '',
      tags: typeof parsed.tags === 'string' ? parsed.tags : '',
      // 附件是 Blob，进不了 localStorage —— 关掉 App 只保得住正文和标签。
      attachments: [],
    }
  } catch {
    return { ...EMPTY_COMPOSER }
  }
}

function saveComposer(draft: ComposerDraft): void {
  try {
    if (!draft.text.trim() && !draft.tags.trim()) window.localStorage.removeItem(COMPOSER_KEY)
    else window.localStorage.setItem(COMPOSER_KEY, JSON.stringify({ text: draft.text, tags: draft.tags }))
  } catch {
    // 存储不可用：草稿这次会话里仍然在。
  }
}

/** 用户写的那行标签 → 数组。逗号、顿号、空格都算分隔。 */
export function parseComposerTags(tags: string): string[] {
  return [...new Set(tags.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean))]
}

/** 点击选项后到分支第一句之间的停顿。参考稿是 setTimeout(it.go, 700)。 */
const REPLY_LEAD_MS = 700

/** 推荐语整理出的档案卡：AI 那句说完到卡片冒出来的停顿。与队列里的 TERMINAL_GAP_MS 一致。 */
const ARCHIVE_GAP_MS = 520

/**
 * 攒着、还没落下的一件东西。
 *
 * 它与 Entry 的区别是「还没发生」：draft 原样留着，等长按「记下此刻」时整组一次落成。
 * preview 只给卫星卡上的缩略看：一句话给文字、声音给时长、照片给一个 object URL。
 * URL 的生命周期由 store 管（stageDraft 建、unstage/clearStaged 撤销）。
 */
export interface StagedItem {
  id: string
  kind: EntryKind
  draft: EntryDraft
  preview: { text?: string; url?: string; durationMs?: number }
}

/**
 * C 层：视觉 LLM 增强。落库**之后**才发，默认关闭，失败静默——
 * 本地标签已经写死在库里，LLM 掉线不影响「这张照片有标签」这件事实。
 *
 * 抽出来是因为现在有两条落库路（capture 一条、commitMoment 一组）都要它。
 */
function runVisionEnrich(entry: Entry, draft: EntryDraft, onUpdate: (entry: Entry) => void): void {
  const blob = draft.blob
  if (draft.kind !== 'photo' || !blob) return
  void (async () => {
    try {
      const dataUrl = await toVisionDataUrl(blob)
      const llm = await enrichPhotoTags({ dataUrl, local: entry.tags })
      if (!llm) return
      const updated = await updateEntryTags(entry.id, mergeLlmTags(entry.tags, llm), 'llm')
      if (updated) onUpdate(updated)
    } catch {
      // 回落：什么都不做，保留本地标签。
    }
  })()
}

type Store = {
  pane: Pane
  overlay: OverlayId | null
  /** 打开 capture 浮层时先落在哪一屏。 */
  captureIntent: CaptureIntent
  /** 采到的东西往哪儿去。见 CaptureTarget。 */
  captureTarget: CaptureTarget
  /** 「记录此刻」编辑器里的东西（正文 / 标签 / 附件）。 */
  composer: ComposerDraft
  composerPatch: (patch: Partial<Pick<ComposerDraft, 'text' | 'tags'>>) => void
  composerAttach: (draft: EntryDraft) => void
  composerDetach: (index: number) => void
  composerReset: () => void
  /** 把编辑器里的东西一次落下（共享一个 momentId）。空的返回 null。 */
  composerCommit: () => Promise<Entry[] | null>
  toast: string | null
  entries: Entry[]
  /** 只在本次会话里新留下的。时间页与发现页仍需要「本次新留下的」这个概念，所以字段保留。 */
  captured: Entry[]
  /** 攒着、还没落下的东西。首页卫星卡渲染它，长按「记下此刻」时整组落成一个 moment。 */
  staged: StagedItem[]
  hydrated: boolean
  /** hydrate 那一刻取的时间锚点。7 天窗口以它为起点，不每帧现取。 */
  hydratedAt: number

  /** 「理解」整理出、被用户自己按下的「更新到发现」。进发现页的第一条。 */
  discoveries: DiscoveryCard[]
  /** 已保留的发现卡 id。保留之后它固定，不被后续整理挤掉。 */
  keptDiscoveries: string[]
  /** 已解散的册 id（judge / promoted）。守望册不可解散——撤守望在守望词上。 */
  dissolvedDiscoveries: string[]
  /** 一次性高亮：刚被更新进来的那张卡。 */
  promotedId: string | null

  /** 守望：用户立过的约。跨会话持久（Dexie），agent 的第一个长期状态。 */
  watches: Watch[]
  /** 自建合集：用户自己挑的几条记录。跨会话持久（Dexie），与守望同族。 */
  collections: Collection[]

  /**
   * 「理解」你已经进去过。
   *
   * 它现在是**成册自动触发的闸门**：一次导入 ≥3 条时，只有你已经打开过理解页，
   * 才让模型看一眼这组能不能拢成一册——否则回执会砸在一个你还不知道存在的地方。
   */
  aiBegun: boolean
  aiMessages: AiMessage[]
  /** 待浮现。留在 store 里 → 切 Tab 不丢、可以续播。 */
  aiQueue: QueuedItem[]
  /** 对话历史（localStorage）。当前这段不在里面——它是活的，切走/开新的才归档。 */
  sessions: Session[]
  /** 当前这段的 id。null = 新开的、还没归档过的一段。 */
  sessionId: string | null

  goPane: (pane: Pane) => void
  openOverlay: (id: OverlayId) => void
  /** 打开采集浮层并指定落点，以及采到的东西往哪儿去（攒着 / 进编辑器）。 */
  openCapture: (intent: CaptureIntent, target?: CaptureTarget) => void
  closeOverlay: () => void
  showToast: (message: string) => void
  hydrate: () => Promise<void>
  capture: (draft: EntryDraft) => Promise<Entry>
  /** 攒一件。照片会建一个 object URL 给卫星卡当缩略图。 */
  stageDraft: (draft: EntryDraft) => void
  /** 取下一件（点卫星卡上的 ×）。撤销它占的 object URL。 */
  unstage: (id: string) => void
  /** 清空攒着的全部并撤销 URL。首页在收尾动画后调它——不能更早，否则缩略图中途白掉。 */
  clearStaged: () => void
  /** 整组落成一个 moment：一个 Dexie 事务、共享 momentId。相册连选也走它。 */
  commitMoment: (drafts: readonly EntryDraft[]) => Promise<Entry[]>
  /** 把攒着的全部落下。commitMoment 之上的那层。 */
  commitStaged: () => Promise<Entry[]>

  keepDiscovery: (id: string) => void
  promoteToDiscover: (card: DiscoveryCard) => void
  clearPromoted: () => void
  dissolveDiscovery: (id: string) => void

  /** 立一个守望（发现页的「帮我留意」浮层 / 一句话输入）。同一个词不立两遍。 */
  addWatch: (word: string) => Promise<void>
  /** 撤回守望。无痕：不写回执，相关册由渲染层自然散去。 */
  removeWatch: (id: string) => Promise<void>

  /** 建一个自建合集。名字去重、至少两条；成功返回它，否则 null。 */
  addCollection: (name: string, entryIds: readonly string[]) => Promise<Collection | null>
  /** 删掉一个合集。记录一条不动——它只是不再拢在一起。 */
  removeCollection: (id: string) => Promise<void>

  /** 把当前这段归档进历史（空的不写）。返回是否真的归档了。 */
  archiveSession: () => boolean
  /** 开新的一段：先归档当前，再清空。 */
  newSession: () => void
  /** 打开历史里的一段：先归档当前，再把那段灌回来。 */
  openSession: (id: string) => void
  /** 从历史里删掉一段。 */
  removeSession: (id: string) => void

  /**
   * 自由输入里的「整理 / 查询册」。本地意图路由（volumeIntent.ts）命中时
   * 排队回执并返回 true；没命中返回 false，调用方照旧走 LLM 那一路。
   */
  aiVolumesFree: (text: string) => boolean
  /**
   * 两步成册的第二步：本地召回一个时间邻近的候选组 → LLM 判定「是不是一件事」。
   * 判定通过就排一张**草稿**回执（留下才转正）；不值得 / 失败 / 没有候选，返回 false。
   * 已判过的组记在 dossierSeen 里，不重复问、不重复付费。
   */
  aiDossier: () => Promise<boolean>
  /** 已交给 LLM 判过的候选组成员 id。只活在内存里（重启即重来，符合「不留痕」）。 */
  dossierSeen: string[]
  /** 对话里「翻开来」的落点：发现页卷内自动翻开这一册，看完即清。 */
  volumeFocusId: string | null
  focusVolume: (id: string) => void
  clearVolumeFocus: () => void
  aiAppend: (message: AiMessage) => void
  /** 把队列的头一项落进流里——回执一句一句浮现，由 useAiQueue 按 gapMs 驱动。 */
  aiAdvance: () => void

  /**
   * 视觉 LLM 是否开启（默认关）。**这是全项目唯一让记录离开设备开关**：
   * 开启后，照片会被缩到 512px、剥掉 EXIF 后发送到远端做画面描述。
   * 关着时一切留在本机，照片仍有本地标签（亮度/色温/时段）。
   */
  visionEnabled: boolean
  setVisionEnabled: (on: boolean) => void
}

let toastTimer: number | undefined

export const useStore = create<Store>((set, get) => ({
  pane: 'moment',
  overlay: null,
  captureIntent: 'sound',
  captureTarget: 'stage',
  composer: loadComposer(),
  toast: null,
  entries: [],
  captured: [],
  staged: [],
  hydrated: false,
  hydratedAt: 0,
  discoveries: [],
  keptDiscoveries: [],
  dissolvedDiscoveries: [],
  promotedId: null,
  volumeFocusId: null,
  visionEnabled: false,
  dossierSeen: [],
  watches: [],
  collections: [],
  aiBegun: false,
  aiMessages: [],
  aiQueue: [],
  sessions: loadSessions(),
  sessionId: null,

  goPane: (pane) => {
    set({ pane })
    // 第一次进理解页 = 成册自动触发的闸门打开（见 aiBegun 的说明）。
    if (pane === 'ai' && !get().aiBegun) set({ aiBegun: true })
  },

  openOverlay: (overlay) => set({ overlay }),

  openCapture: (intent, target = 'stage') =>
    set({ overlay: 'capture', captureIntent: intent, captureTarget: target }),

  closeOverlay: () => set({ overlay: null, captureIntent: 'sound', captureTarget: 'stage' }),

  composerPatch: (patch) => {
    const next = { ...get().composer, ...patch }
    set({ composer: next })
    saveComposer(next)
  },

  composerAttach: (draft) => {
    set((s) => ({ composer: { ...s.composer, attachments: [...s.composer.attachments, draft] } }))
  },

  composerDetach: (index) => {
    set((s) => ({
      composer: { ...s.composer, attachments: s.composer.attachments.filter((_, i) => i !== index) },
    }))
  },

  composerReset: () => {
    set({ composer: { ...EMPTY_COMPOSER } })
    saveComposer(EMPTY_COMPOSER)
  },

  composerCommit: async () => {
    const { text, tags, attachments } = get().composer
    const body = text.trim()
    const clues = parseComposerTags(tags)

    const drafts: EntryDraft[] = []
    if (body) drafts.push({ kind: 'word', text: body, clues })
    // 那行标签说的是「这一刻」，所以附上的照片 / 声音也带上同一批线索。
    for (const item of attachments) {
      drafts.push(clues.length > 0 ? { ...item, clues: [...clues, ...(item.clues ?? [])] } : item)
    }
    if (drafts.length === 0) return null

    const made = await get().commitMoment(drafts)
    get().composerReset()
    return made
  },

  showToast: (message) => {
    set({ toast: message })
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => set({ toast: null }), 2400)
  },

  hydrate: async () => {
    await seedIfEmpty()
    await seedWatchesIfEmpty()
    set({
      entries: await listEntries(),
      watches: await listWatches(),
      collections: await listCollections(),
      hydrated: true,
      hydratedAt: Date.now(),
    })
  },

  capture: async (draft) => {
    const entry = await persistEntry(draft)
    set((s) => ({ entries: [entry, ...s.entries], captured: [entry, ...s.captured] }))

    if (get().visionEnabled) {
      runVisionEnrich(entry, draft, (updated) => {
        set((s) => ({ entries: s.entries.map((e) => (e.id === updated.id ? updated : e)) }))
      })
    }
    return entry
  },

  stageDraft: (draft) => {
    const preview: StagedItem['preview'] = {}
    if (draft.text !== undefined) preview.text = draft.text
    if (draft.durationMs !== undefined) preview.durationMs = draft.durationMs
    if (draft.kind === 'photo' && draft.blob) preview.url = URL.createObjectURL(draft.blob)
    set((s) => ({ staged: [...s.staged, { id: createId('st'), kind: draft.kind, draft, preview }] }))
  },

  unstage: (id) => {
    set((s) => {
      const item = s.staged.find((x) => x.id === id)
      if (item?.preview.url) URL.revokeObjectURL(item.preview.url)
      return { staged: s.staged.filter((x) => x.id !== id) }
    })
  },

  clearStaged: () => {
    set((s) => {
      for (const item of s.staged) if (item.preview.url) URL.revokeObjectURL(item.preview.url)
      return { staged: [] }
    })
  },

  commitMoment: async (drafts) => {
    const entries = await addMoment(drafts)
    const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt)
    set((s) => ({ entries: [...sorted, ...s.entries], captured: [...sorted, ...s.captured] }))

    if (get().visionEnabled) {
      for (let i = 0; i < entries.length; i++) {
        runVisionEnrich(entries[i]!, drafts[i]!, (updated) => {
          set((s) => ({ entries: s.entries.map((e) => (e.id === updated.id ? updated : e)) }))
        })
      }
    }

    // 一次落下够多：让模型看一眼这组能不能拢成一册（两步成册，docs/24 §七）。
    // 只在理解页已经聊过时才触发——否则回执会和开场白打架。
    if (entries.length >= 3 && get().aiBegun) void get().aiDossier()
    return entries
  },

  commitStaged: async () => {
    const staged = get().staged
    if (staged.length === 0) return []
    return get().commitMoment(staged.map((item) => item.draft))
  },

  keepDiscovery: (id) => {
    set((s) => ({
      keptDiscoveries: s.keptDiscoveries.includes(id)
        ? s.keptDiscoveries.filter((x) => x !== id)
        : [id, ...s.keptDiscoveries],
    }))
  },

  /**
   * 「更新到发现」是**用户动作**，不是自动行为。
   *
   * AI 整理出来的东西要不要留下，由你决定——这跟首页「什么都不留下也是完整答案」
   * 是同一条原则。所以它落成一个次要按钮，不用强调色。
   */
  promoteToDiscover: (card) => {
    set((s) => ({
      discoveries: [card, ...s.discoveries.filter((c) => c.id !== card.id)],
      promotedId: card.id,
    }))
  },

  clearPromoted: () => set({ promotedId: null }),

  /**
   * 解散一册。档案是聚合视图，不是搬运——记录一条不少地散回时间页，
   * 本来也从未离开过。只有 judge / promoted 的册可以解散；守望的册属于
   * 守望词本身，要散去理解页撤那个词（docs/23 的边界）。
   * 与 keptDiscoveries 一样是会话态：刷新回来册架重聚（判据还在）。
   */
  dissolveDiscovery: (id) => {
    set((s) => ({ dissolvedDiscoveries: [...s.dissolvedDiscoveries, id] }))
  },

  addWatch: async (word) => {
    const watch = await persistWatch(word)
    if (watch) set((s) => ({ watches: [...s.watches, watch] }))
  },

  removeWatch: async (id) => {
    await persistWatchRemove(id)
    set((s) => ({ watches: s.watches.filter((w) => w.id !== id) }))
  },

  addCollection: async (name, entryIds) => {
    const collection = await persistCollection(name, entryIds)
    if (collection) set((s) => ({ collections: [...s.collections, collection] }))
    return collection
  },

  removeCollection: async (id) => {
    await persistCollectionRemove(id)
    set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }))
  },

  /**
   * 归档当前这段。空的不写——一段什么都没说的对话不值得留一行。
   * 已归档过的（sessionId 有值）按 id 覆盖，不产生第二行。
   */
  archiveSession: () => {
    const { aiMessages, sessions, sessionId } = get()
    if (aiMessages.length === 0) {
      // 空的一段也要把 id 清掉，否则下一次归档会顶着同一个 id 写。
      if (sessionId) set({ sessionId: null })
      return false
    }
    const existing = sessionId ? sessions.find((s) => s.id === sessionId) : undefined
    const session = toSession(aiMessages, sessionId ?? undefined, existing?.createdAt)
    const rest = sessions.filter((s) => s.id !== session.id)
    const next = sortSessions([session, ...rest])
    saveSessions(next)
    set({ sessions: next, sessionId: null })
    return true
  },

  newSession: () => {
    get().archiveSession()
    set({ aiMessages: [], aiQueue: [] })
  },

  openSession: (id) => {
    const target = get().sessions.find((s) => s.id === id)
    if (!target) return
    get().archiveSession()
    // 归档可能改动了 sessions（把当前那段写了进去），重新取一遍。
    const latest = get().sessions.find((s) => s.id === id) ?? target
    set({ aiMessages: [...latest.messages], aiQueue: [], sessionId: id })
  },

  removeSession: (id) => {
    const next = get().sessions.filter((s) => s.id !== id)
    saveSessions(next)
    set({ sessions: next, sessionId: get().sessionId === id ? null : get().sessionId })
  },

  /** 弹出队首并落下。回执一条一条浮现，由 useAiQueue 按 gapMs 驱动。 */
  aiAdvance: () => {
    const [head, ...rest] = get().aiQueue
    if (!head) return

    if (head.kind === 'volume') {
      set((s) => ({
        aiQueue: rest,
        aiMessages: [
          ...s.aiMessages,
          { id: createId('m'), kind: 'volume', card: head.card, draft: head.draft },
        ],
      }))
      return
    }

    if (head.kind === 'volumes') {
      set((s) => ({
        aiQueue: rest,
        aiMessages: [
          ...s.aiMessages,
          { id: createId('m'), kind: 'volumes', cards: head.cards, draft: head.draft },
        ],
      }))
      return
    }

    set((s) => ({
      aiQueue: rest,
      aiMessages: [...s.aiMessages, { id: createId('m'), kind: 'ai', line: head.line }],
    }))
  },

  aiAppend: (message) => set((s) => ({ aiMessages: [...s.aiMessages, message] })),

  /**
   * 对话返回册（docs/23 §三）。本地意图路由命中才排队回执——查询与整理
   * 都不需要 LLM；没命中返回 false，useFreeText 照旧走自由输入那一路。
   */
  aiVolumesFree: (text) => {
    // 在说话时不插队，也不吞掉这句话——返回 false 让自由输入那一路接手。
    if (get().aiQueue.length > 0) return false

    const s = get()
    const base = [...s.discoveries, ...buildDiscoveries(s.entries, s.watches, s.collections)]
    // 话里点到的东西 → 一册。两条来路：
    //  - **标签值**（闭集）：写入时就落到每条记录上了，命中即相等；
    //  - **自由线索**（开集）：「马克杯」「缆车」这种具体的词，命中按子串。
    // 册名即那个词，天然走 routeVolumeIntent 的 byTitle 分支（无需改它的签名）。
    // 同名只造一次——避免行列表里出现两条一样的册。
    const seen = new Set(base.map((c) => c.title))
    const promote = (title: string, card: DiscoveryCard | null): DiscoveryCard | null => {
      if (!card || seen.has(title)) return null
      seen.add(title)
      return card
    }
    const tagCards = collectTagCandidates(s.entries)
      .filter(({ label }) => text.includes(label))
      .map(({ label, dim }) => promote(label, tagCardFrom(label, dim, s.entries)))
      .filter((c): c is DiscoveryCard => c !== null)
    // 线索走字面命中：用户说「马克杯」找得到标了「马克杯」的。
    // 「说杯子、找到马克杯」那种要靠语义，交给自由输入那一路的 LLM（记忆摘要里带了线索）。
    const clueCards = collectClueCandidates(s.entries)
      .filter((clue) => text.includes(clue))
      .map((clue) => promote(clue, clueCardFrom(clue, s.entries)))
      .filter((c): c is DiscoveryCard => c !== null)
    const volumes = [...tagCards, ...clueCards, ...base]
    const routed = routeVolumeIntent(text, volumes, {
      leadOf: (c) => volumeOf(c).lead,
      keptIds: s.keptDiscoveries,
    })
    if (!routed) return false

    set((cur) => ({
      aiMessages: [...cur.aiMessages, { id: createId('m'), kind: 'me', text }],
    }))

    const queued: QueuedItem[] = []
    if (routed.kind === 'organize') {
      // 草稿如实自报：「这一册还不存在」；已有册只引路，不假装又整理了一遍。
      queued.push({
        kind: 'ai',
        line: { parts: [t(routed.draft ? '替你拢了拢，是这样一册。' : '这一册已经在架子上了。')], atMs: 0 },
        gapMs: REPLY_LEAD_MS,
      })
      queued.push({
        kind: 'volume',
        card: routed.cards[0],
        draft: routed.draft,
        gapMs: ARCHIVE_GAP_MS,
      })
    } else {
      queued.push({ kind: 'ai', line: { parts: [t('替你找到了这些。')], atMs: 0 }, gapMs: REPLY_LEAD_MS })
      if (routed.cards.length === 1) {
        queued.push({ kind: 'volume', card: routed.cards[0], draft: false, gapMs: ARCHIVE_GAP_MS })
      } else {
        queued.push({ kind: 'volumes', cards: routed.cards, draft: false, gapMs: ARCHIVE_GAP_MS })
      }
    }

    set((cur) => ({ aiQueue: [...cur.aiQueue, ...queued] }))
    return true
  },

  /**
   * 两步成册的第二步（docs/23 §四 的 dossier）：本地按时间邻近召回一个候选组，
   * 交给 LLM 判「是不是一件事」。判定通过 → **草稿**回执（留下才转正）。
   *
   * 模型有权说不：worth=false 就是「这些不成册」。这就是「有价值的场景才成册」的落点——
   * 由模型判断，不是本地拍阈值。失败（没答上来）不标记，下次可重试。
   */
  aiDossier: async () => {
    // 正在说话时不插队，回执会叠在一起。
    if (get().aiQueue.length > 0) return false

    const seen = new Set(get().dossierSeen)
    // 最近的一个「还没判过」的候选组。
    const group = candidateGroups(get().entries).find(
      (g) => !g.entries.every((e) => seen.has(e.id)),
    )
    if (!group) return false

    const groupIds = group.entries.map((e) => e.id)
    const verdict = await judgeGroup(group)
    // 没答上来：不标记（下次可重试），也什么都不做——本地判据册照常出。
    if (!verdict) return false

    // 判过了（无论值不值得）就记下整组，不重复问、不重复付费。
    set({ dossierSeen: [...get().dossierSeen, ...groupIds] })
    if (!verdict.worth || !verdict.title.trim()) return false

    // 模型挑出的子集（越界/重复由 membersOf 挡掉）；一条没对上就回落到整组。
    const members = membersOf(group, verdict)
    const card = cardFromVerdict(
      { kind: verdict.kind, title: verdict.title, note: verdict.note },
      get().entries,
      members.map((e) => e.id),
    )
    if (!card) return false

    const queued: QueuedItem[] = [
      {
        kind: 'ai',
        line: { parts: [t('替你拢了拢，是这样一册。')], atMs: 0 },
        gapMs: REPLY_LEAD_MS,
      },
      { kind: 'volume', card, draft: true, gapMs: ARCHIVE_GAP_MS },
    ]
    set((cur) => ({ aiQueue: [...cur.aiQueue, ...queued] }))
    return true
  },

  focusVolume: (id) => set({ volumeFocusId: id }),
  clearVolumeFocus: () => set({ volumeFocusId: null }),
  setVisionEnabled: (on) => set({ visionEnabled: on }),
}))
