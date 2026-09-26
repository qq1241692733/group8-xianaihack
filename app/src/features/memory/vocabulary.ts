/**
 * 受控标签词表——四个机器维度的唯一来源。
 *
 * 为什么要有它：标签是**机器用的**。本地判据（`discoveries.ts` 的 `themes.includes('出游')`）、
 * 守望匹配、聚合计数，全都按固定词比较。而模型自由发挥的词（实测出现过「自然风光」「排队」
 * 「山间栈道」）**永远命中不了这些判据**——视觉打标就白做了。
 *
 * 所以边界这样切：
 *  - **词表由代码定义**（这里），规则提取与 LLM 提取都只能产出表内的值；
 *  - **AI 的自由度只用在「从里面选哪一个」**；
 *  - `scene` **不在此列**——它是给人读的一句画面描述，保持自由文本；
 *  - 模型说出的表外词**不丢**，由 `splitKnown` 切出来、捞进 `EntryTags.clues`
 *    （自由线索，见 types.ts）。受控词表管的是「哪一维装它」，不是「要不要留它」。
 *
 * 加词要三处对齐：本文件 + `extract.ts` 的规则词典 + 需要它的判据（`DISCOVERY_DEFS`）。
 */

export const THEMES = ['独处', '工作', '休息', '出游', '关系', '自我', '身体'] as const
export const EMOTIONS = ['停顿', '疲惫', '焦虑', '平静', '轻松', '自责'] as const
export const PEOPLE = ['家人', '朋友', '同事', '伴侣', '孩子'] as const
export const PLACES = ['家', '公司', '咖啡厅', '地铁', '外面', '山上'] as const

export type VocabDim = 'themes' | 'emotions' | 'people' | 'places'

export const VOCAB: Record<VocabDim, readonly string[]> = {
  themes: THEMES,
  emotions: EMOTIONS,
  people: PEOPLE,
  places: PLACES,
}

/** 给提示词用的「可选值」清单，格式固定，避免模型自己造词。 */
export function vocabList(dim: VocabDim): string {
  return VOCAB[dim].join(' / ')
}

/**
 * 把一次提取的值切成「表内 / 表外」两堆。
 *
 * 表内的照旧进那个维度；**表外的不是噪声，是线索**——它们恰恰是模型对**这一张**画面
 * 最具体的说法（实测被丢过的：「自然风光」「排队」「山间栈道」），而长跨度合集的锚点
 * 正是这种具体的物与事，不是「出游」这种类别。丢掉它们，这个合集就再也长不出来。
 *
 * 所以表外词由调用方捞进 `clues`，**不在这里丢**。丢弃只发生在「哪一维装它」这件事上。
 */
export function splitKnown(
  dim: VocabDim,
  values: readonly string[],
): { kept: string[]; dropped: string[] } {
  const allowed = new Set<string>(VOCAB[dim])
  const kept: string[] = []
  const dropped: string[] = []
  for (const value of values) {
    if (allowed.has(value)) kept.push(value)
    else dropped.push(value)
  }
  return { kept: [...new Set(kept)], dropped: [...new Set(dropped)] }
}
