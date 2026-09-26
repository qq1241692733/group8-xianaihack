import { captionOf } from './display'
import type { Entry } from './types'

/**
 * 读时聚合。
 *
 * 全部是纯函数：入参不动，返回值是原始值或新数组，`Entry` 上永远不多一个字段。
 * 这不是洁癖——repo.test.ts 有一条「把「无用」写进 schema」的测试盯着：
 * Entry 上出现 count / total / streak 之类就红。计数只活在读的这一瞬间。
 *
 * 标签维度没有建索引（见 db.ts 的说明），所以这里是内存过滤。个人几千条封顶，
 * 微秒级；复杂度花在「写入时提取标签」上更值。
 */

export type TagDim = 'themes' | 'emotions' | 'people' | 'places'

export function countByTag(entries: readonly Entry[], dim: TagDim, value: string): number {
  return entries.filter((entry) => entry.tags[dim].includes(value)).length
}

export function countByTheme(entries: readonly Entry[], theme: string): number {
  return countByTag(entries, 'themes', theme)
}

export function countByEmotion(entries: readonly Entry[], emotion: string): number {
  return countByTag(entries, 'emotions', emotion)
}

/** 窗口起点含在窗口内（>=）。 */
export function entriesSince(entries: readonly Entry[], sinceTs: number): Entry[] {
  return entries.filter((entry) => entry.createdAt >= sinceTs)
}

export function countSince(
  entries: readonly Entry[],
  sinceTs: number,
  pred?: (entry: Entry) => boolean,
): number {
  const windowed = entriesSince(entries, sinceTs)
  return pred ? windowed.filter(pred).length : windowed.length
}

function richWord(entry: Entry): number {
  return entry.kind === 'word' && entry.text ? 1 : 0
}

/**
 * 精确日期检索：容差内离目标最近的那条。
 * 平手时优先「word 且有 text」——8/17 那张卡片要的是那句话，不是一条没有文字的声音。
 */
export function entryNearestDate(
  entries: readonly Entry[],
  targetTs: number,
  toleranceMs: number,
): Entry | undefined {
  let best: Entry | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (const entry of entries) {
    const distance = Math.abs(entry.createdAt - targetTs)
    if (distance > toleranceMs) continue

    if (distance < bestDistance) {
      best = entry
      bestDistance = distance
      continue
    }
    if (distance === bestDistance && best && richWord(entry) > richWord(best)) {
      best = entry
    }
  }

  return best
}

export type Digest = {
  themes: Array<{ tag: string; n: number }>
  emotions: Array<{ tag: string; n: number }>
  /**
   * 出现过的**自由线索**，按次数降序、限量。
   *
   * 它是模型把「用户嘴里的词」和「记录里的具体东西」联起来的桥：
   * 用户说「杯子」，而记录里标的是「马克杯」——语义那一步只有模型做得了，
   * 前提是它得看得见这些线索。所以摘要里必须有它们。
   */
  clues: Array<{ tag: string; n: number }>
  /** 最近几条的主文案，按时间倒序。给提示词当「你记得什么」用。 */
  recent: string[]
}

/** 摘要里最多带几条线索。线索是开集，不设限会把提示词撑爆。 */
const MAX_DIGEST_CLUES = 12

/**
 * 喂给 LLM 提示词的最小记忆摘要。
 * 只给计数与最近几条 caption——不把整库倒给模型。
 */
export function memoryDigest(entries: readonly Entry[], recentCount = 5): Digest {
  const tallyOf = (values: (entry: Entry) => readonly string[], cap = Number.POSITIVE_INFINITY) => {
    const counts = new Map<string, number>()
    for (const entry of entries) {
      for (const tag of values(entry)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([tag, n]) => ({ tag, n }))
      .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
      .slice(0, cap)
  }

  const recent = [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, recentCount)
    .map(captionOf)

  return {
    themes: tallyOf((entry) => entry.tags.themes),
    emotions: tallyOf((entry) => entry.tags.emotions),
    clues: tallyOf((entry) => entry.tags.clues, MAX_DIGEST_CLUES),
    recent,
  }
}
