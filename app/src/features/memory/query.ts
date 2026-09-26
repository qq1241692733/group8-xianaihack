import type { TagDim } from './aggregate'
import type { Entry } from './types'

/**
 * 按标签检索记录。全部纯函数、内存过滤——沿用 db.ts 的决定：
 * 标签维度不建索引，个人几千条封顶，微秒级。
 *
 * 这是「AI 根据标签快速搜索和整理」的本地底座：召回由这里固定地做，
 * LLM 只负责在候选上判定/起名（docs/23 §四 的分工）。
 */

/** 精确命中某个标签维度下的值。 */
export function filterByTag(entries: readonly Entry[], dim: TagDim, value: string): Entry[] {
  return entries.filter((entry) => entry.tags[dim].includes(value))
}

/** 按场景描述子串命中。 */
export function filterByScene(entries: readonly Entry[], needle: string): Entry[] {
  return entries.filter((entry) => entry.tags.scene.includes(needle))
}

/**
 * 一条记录是否命中任一关键词。
 *
 * 匹配面：场景描述 + 正文 + themes / people / places 三个标签数组 + **自由线索 clues**。
 * 守望（watches.ts 的 watchMatches）与这里的匹配面**必须一致**——两者是
 * 「同一个词在不同语境下找记录」的同一件事，所以守望直接复用它。
 *
 * clues 是子串匹配：线索是具体的物与事（「马克杯」「缆车」），
 * 用户说「杯子」「缆车」都该找得到，不必逐字相等。
 */
export function entryMatches(entry: Entry, needles: readonly string[]): boolean {
  const haystack = [
    entry.tags.scene,
    entry.text ?? '',
    ...entry.tags.themes,
    ...entry.tags.people,
    ...entry.tags.places,
    ...entry.tags.clues,
  ]
  return haystack.some((cell) => needles.some((n) => cell.includes(n)))
}

export interface TagCandidate {
  label: string
  dim: TagDim
}

const DIMS: readonly TagDim[] = ['themes', 'emotions', 'people', 'places']

/**
 * 「此刻」是原子的：命中其中一条，就把同一 momentId 下的全部一起带出来。
 *
 * 拍张照、再写句心情——判据（比如「出游」）只命中照片，但检索结果里该有那句话。
 * 没有 momentId 的命中原样返回（单独留下的一条就是一条）。
 *
 * 只在**把命中聚成册**的地方用（discoveries 的 cardFromDef / watchCard），不用在
 * 逐条渲染的时间流上——那里展开会重复。
 *
 * 副作用是有意的：展开可能把不匹配判据的同组元素也拉进册，把条目数顶过 MIN_ITEMS。
 * 一个「此刻」不该被劈开看，所以这是对的。
 */
export function expandToMoments(entries: readonly Entry[], hits: readonly Entry[]): Entry[] {
  const moments = new Set<string>()
  for (const hit of hits) if (hit.momentId) moments.add(hit.momentId)

  const seen = new Set<string>()
  const out: Entry[] = []
  const take = (entry: Entry) => {
    if (seen.has(entry.id)) return
    seen.add(entry.id)
    out.push(entry)
  }

  for (const hit of hits) {
    if (hit.momentId) continue
    take(hit)
  }
  for (const entry of entries) {
    if (entry.momentId && moments.has(entry.momentId)) take(entry)
  }

  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** 库里出现过的全部标签值（跨维度去重）。理解页据此把「话里提到的标签」聚成册。 */
export function collectTagCandidates(entries: readonly Entry[]): TagCandidate[] {
  const seen = new Set<string>()
  const out: TagCandidate[] = []
  for (const entry of entries) {
    for (const dim of DIMS) {
      for (const label of entry.tags[dim]) {
        const key = `${dim}:${label}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ label, dim })
      }
    }
  }
  return out
}

/**
 * 库里出现过的全部**自由线索**（去重、保序）。
 *
 * 与 `collectTagCandidates` 分开，因为语义不同：标签值是**闭集**里的整词，命中即相等；
 * 线索是**开集**里的短词，命中要按子串（用户说「杯子」，该找到标了「马克杯」的那条）。
 * 混在一起会把精确匹配退化成模糊匹配，标签那边反而失准。
 */
export function collectClueCandidates(entries: readonly Entry[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of entries) {
    for (const clue of entry.tags.clues) {
      if (seen.has(clue)) continue
      seen.add(clue)
      out.push(clue)
    }
  }
  return out
}
