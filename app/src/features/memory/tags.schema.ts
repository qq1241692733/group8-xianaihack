import { z } from 'zod'

import type { EntryTags } from './types'
import { splitKnown, type VocabDim } from './vocabulary'

/**
 * zod 在本项目的用途之一：校验模型返回的标签 JSON。
 *
 * 校验分两层，边界不一样：
 *  - **形状严格**：少给字段就是一次不合格返回，判失败并回落到规则提取，而不是替它补空数组
 *    ——那会把「没答上来」伪装成「答了没有」。**唯一的例外是 `clues`**（见下）。
 *  - **取值过滤**：四个机器维度的值只保留 vocabulary.ts 词表内的。模型给了表外的词
 *    —— **不丢，捞进 `clues`**。丢弃只发生在「哪一维装它」这件事上，不发生在「要不要留」上。
 *    `scene` 是给人读的自由描述，不设限。
 *
 * 为什么放在客户端而不是代理里：代理只负责转发（见 server/llmProxy.ts），
 * 它不认识项目的数据结构。校验是记忆层的事。
 */
export const EntryTagsSchema = z.object({
  scene: z.string(),
  themes: z.array(z.string()),
  emotions: z.array(z.string()),
  people: z.array(z.string()),
  places: z.array(z.string()),
  // 这一个字段**允许缺**：它表达的是「额外的线索，可以没有」，空数组就是「没有」，
  // 不是「没答上来」。其余五个字段缺一个即整次判失败——那才是真的没答。
  clues: z.array(z.string()).optional(),
})

/** 单条线索的长度上限。太长的不是线索，是一句话——那句话的位置在 scene。 */
const MAX_CLUE_CHARS = 16
/** 一条记录最多留几条线索。宁可多留，但不能无限。 */
const MAX_CLUES = 12

/** 去空白、丢掉空的与过长的、去重、限量。线索不查词表——它的价值就在于不受词表限制。 */
export function cleanClues(values: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of values) {
    const clue = raw.trim()
    if (!clue || clue.length > MAX_CLUE_CHARS) continue
    if (out.includes(clue)) continue
    out.push(clue)
    if (out.length >= MAX_CLUES) break
  }
  return out
}

/** 形状不合格返回 null，调用方据此回落到 extractTags。 */
export function parseLlmTags(raw: unknown): EntryTags | null {
  const parsed = EntryTagsSchema.safeParse(raw)
  if (!parsed.success) return null
  const tags = parsed.data

  const dims: VocabDim[] = ['themes', 'emotions', 'people', 'places']
  const split = {} as Record<VocabDim, ReturnType<typeof splitKnown>>
  for (const dim of dims) split[dim] = splitKnown(dim, tags[dim])

  return {
    scene: tags.scene.trim(),
    themes: split.themes.kept,
    emotions: split.emotions.kept,
    people: split.people.kept,
    places: split.places.kept,
    // 模型自己写的线索在前（它是特意说的），四个维度装不下的词在后（捞回来的）。
    clues: cleanClues([
      ...(tags.clues ?? []),
      ...split.themes.dropped,
      ...split.emotions.dropped,
      ...split.people.dropped,
      ...split.places.dropped,
    ]),
  }
}
