import type { DiscoveryCard } from '@/data/discoveries'

/**
 * 「对话返回册」的本地意图路由（docs/23 §三）。
 *
 * 判定**全在本地、可测试**——查询不走 LLM（已有册 + 关键词命中，确定性），
 * 整理命中示例册时也直接出草稿回执（留下才转正）。都没命中就返回 null，
 * 调用方照旧走自由输入那一路（LLM + 剧本兜底）。路由的歧义由这里的规则吸收，
 * 不推给用户措辞。
 *
 * 动作由**状态**决定，不由意图决定（docs/23 §三 的一刀）：
 *  - 查询 → 已有册回执，动作「翻开来」；
 *  - 整理 → 守望册 / 已保留册 = 已有（翻开来）；示例册（judge，还没被留下过）
 *    = 草稿（留下 / 不要）。LLM 聚出来的新册走两条成册链，不在这里。
 */

const QUERY_RE = /哪些|找到|找一下|查(一)?查|看看|有什么|翻出|找(几)?个/
const ORGANIZE_RE = /整理|归拢|收一收|聚一|合在一起|汇总|收成/

/** 这句话是不是在要求「整理」（本地判定）。给 dossier 那一步做触发闸门用。 */
export function isOrganizeAsk(text: string): boolean {
  return ORGANIZE_RE.test(text)
}

/** 材质的说法 → 主导类型。查询可以按材质过滤：「我留意过哪些声音」。 */
const MATERIAL_WORDS: Array<[RegExp, 'sound' | 'photo' | 'word']> = [
  [/声音|音频|录/, 'sound'],
  [/照片|图片|拍/, 'photo'],
  [/文字|句子|写的?/, 'word'],
]

export interface VolumeIntentResult {
  kind: 'query' | 'organize'
  cards: DiscoveryCard[]
  /** 整理命中示例册时 true（草稿回执：留下 / 不要）；已有册 false（翻开来）。 */
  draft: boolean
}

export function routeVolumeIntent(
  text: string,
  volumes: readonly DiscoveryCard[],
  opts: {
    /** 主导类型怎么取——由 discoveries.ts 的 volumeOf 提供，这里不重复实现。 */
    leadOf: (card: DiscoveryCard) => 'sound' | 'photo' | 'word'
    /** 已保留册的 id。整理命中它们 = 已有，不是草稿。 */
    keptIds: readonly string[]
  },
): VolumeIntentResult | null {
  if (volumes.length === 0) return null

  const wantsQuery = QUERY_RE.test(text)
  const wantsOrganize = ORGANIZE_RE.test(text)
  if (!wantsQuery && !wantsOrganize) return null

  // 命中优先级：册名完整出现在话里 > 材质词。都没说 → 查询视为「全都要」。
  // 册名放行单字（「家」「山」这类标签值也是合法册名），由「完整出现」把误命中挡在外面。
  const byTitle = volumes.filter((c) => c.title.length >= 1 && text.includes(c.title))
  const byMaterial = MATERIAL_WORDS.filter(([re]) => re.test(text)).map(([, m]) => m)
  const picked =
    byTitle.length > 0
      ? byTitle
      : byMaterial.length > 0
        ? volumes.filter((c) => byMaterial.includes(opts.leadOf(c)))
        : []

  if (wantsOrganize) {
    const target = picked[0]
    if (!target) return null
    const exists =
      target.origin === 'watch' || target.origin === 'promoted' || opts.keptIds.includes(target.id)
    return { kind: 'organize', cards: [target], draft: !exists }
  }

  // 查询：点名了没找到的册 / 库里一本都没有 → 让 LLM 那一路接手，不硬凑。
  if (picked.length === 0) return null
  return { kind: 'query', cards: picked, draft: false }
}
