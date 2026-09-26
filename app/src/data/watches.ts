import { db } from '@/features/memory/db'
import { entryMatches } from '@/features/memory/query'
import type { Entry } from '@/features/memory/types'
import { createId } from '@/lib/id'

/**
 * 守望（docs/23）。「帮我发现」的显式设定——你让这个产品替你留意什么。
 *
 * ── 设计里最要紧的几条，都在类型上 ─────────────────────────
 *  1. Watch 上只有「词」和它落下的时间。**没有进度、没有上次命中时间、
 *     没有 streak**——守望不是任务，是留意。界面上不出现「已守望 N 天」。
 *  2. 不存守望的**产出**。册是渲染时从记录里现算的（discoveries.ts 的
 *     watchDef），所以撤回一个守望，不会在任何地方留下一具删了一半的尸体
 *     ——相关册自然不再聚，已有的散回时间页，一条不少。
 *  3. 谁能立守望：只有用户按下那一下（理解页守望卡 / 一句话输入）。
 *     AI 只有提议权，且提议必须经确认——这条边界在交互层，不在这里。
 * ─────────────────────────────────────────────────────────
 */

export interface Watch {
  id: string
  /** 一个词或短语：「孩子」「想不到的声音」。 */
  word: string
  createdAt: number
  /**
   * 匹配线索。演示种子守望词用——「想不到的声音」是一句人话，不是一个
   * 会出现在标签里的字面量，所以给它几个能落到标签/场景上的线索词。
   * **界面上永不显示**。正式版里守望匹配由写入记录时的标签提取对齐，
   * 这份 hints 就退场（详见 docs/23 §三「守望的匹配」）。
   */
  hints?: string[]
}

/** 演示种子。正式包把 enabled 改成 false（与 seed.ts 同一口径）。 */
export const watchSeed = { enabled: true }

export const SEED_WATCHES: Array<Pick<Watch, 'word' | 'hints'>> = [
  { word: '孩子', hints: ['孩子'] },
  { word: '想不到的声音', hints: ['缆车', '索道', '风', '钟声', '脚步'] },
]

/**
 * 一个守望词命中一条记录吗。
 *
 * 匹配面与「按标签检索」（features/memory/query.ts 的 entryMatches）**共用同一份实现**：
 * 场景描述、正文、themes / people / places 三个标签数组，词与线索都做子串匹配——
 * 「孩子」要能命中 people 里的「孩子」，也要能命中 scene 里的「孩子在客厅搭积木」。
 */
export function watchMatches(watch: Watch, entry: Entry): boolean {
  return entryMatches(entry, [watch.word, ...(watch.hints ?? [])])
}

export async function listWatches(): Promise<Watch[]> {
  return db.watches.orderBy('createdAt').toArray()
}

/** 立守望。去重：同一个词不立两遍。 */
export async function addWatch(word: string): Promise<Watch | null> {
  const trimmed = word.trim()
  if (!trimmed) return null

  const all = await listWatches()
  if (all.some((w) => w.word === trimmed)) return null

  const watch: Watch = { id: createId('w'), word: trimmed, createdAt: Date.now() }
  await db.watches.put(watch)
  return watch
}

/** 撤回守望。无痕：不写「谁删掉了」的回执，相关册由渲染层自然散去。 */
export async function removeWatch(id: string): Promise<void> {
  await db.watches.delete(id)
}

/**
 * 种子守望。只在 watches 表为空、且没种过的时候灌一次。
 *
 * 「没种过」记在 meta 里而不是看表空——用户把两条种子守望都删了，
 * 刷新页面不该又冒回来。删除是用户的决定，种子不跟它抢。
 */
export async function seedWatchesIfEmpty(): Promise<void> {
  if (!watchSeed.enabled) return

  await db.transaction('rw', db.watches, db.meta, async () => {
    if ((await db.watches.count()) > 0) return
    const done = await db.meta.get('watchSeedDone')
    if (done) return

    const now = Date.now()
    await db.watches.bulkPut(
      SEED_WATCHES.map((seed, i) => ({
        id: createId('wseed'),
        word: seed.word,
        hints: seed.hints,
        createdAt: now - (SEED_WATCHES.length - i) * 60_000,
      })),
    )
    await db.meta.put({ key: 'watchSeedDone', value: true })
  })
}
