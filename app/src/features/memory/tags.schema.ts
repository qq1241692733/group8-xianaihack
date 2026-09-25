import { z } from 'zod'

import type { EntryTags } from './types'

/**
 * zod 在本项目唯一的用途：校验模型返回的标签 JSON。
 *
 * 为什么放在客户端而不是代理里：代理只负责转发（见 server/llmProxy.ts），
 * 它不认识项目的数据结构。校验是记忆层的事。
 *
 * 刻意不设 `.default(...)`：模型少给一个字段就是一次不合格的返回，应当判失败并
 * 回落到规则提取，而不是替它补一个空数组——那会把「没答上来」伪装成「答了没有」。
 * 多余字段由 zod 默认剥离。
 */
export const EntryTagsSchema = z.object({
  scene: z.string(),
  themes: z.array(z.string()),
  emotions: z.array(z.string()),
  people: z.array(z.string()),
  places: z.array(z.string()),
})

/** 解析失败返回 null，调用方据此回落到 extractTags。 */
export function parseLlmTags(raw: unknown): EntryTags | null {
  const parsed = EntryTagsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
