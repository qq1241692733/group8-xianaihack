import { t, type ScriptLine } from '@/data/script'
import { memoryDigest } from '@/features/memory/aggregate'
import type { Entry } from '@/features/memory/types'

/**
 * 自由输入那一路的提示词与清洗。
 *
 * 语气边界是这个产品的命门：它不是助手，不评价你，也不替你打分。所以规则写在
 * 最前面、写得具体——「不评价」太抽象，模型会自己发挥成「你做得已经很好了」。
 */

const MAX_REPLY_CHARS = 60

export const VOICE_RULES = `你在「此刻」里说话。这个产品记录一个人的时刻，但从不评价他。
严格遵守：
- 不评价、不表扬、不安慰式地拔高。绝不出现「加油」「你可以的」「已经很棒了」这类话。
- 不把任何事当成成就、进步或坚持来谈。
- 不催促，不给建议清单，不追问「要不要试试……」。这里没有可以完成的事。
- 不主动开新话题，不把话引到你自己身上，不用「应该」「建议」这类词。
- 只回一到两句话。短。用中文。
- 不用 emoji，不堆感叹号。
- 允许只是听着。不必每次都给出解释或安慰。`

function tallyLine(label: string, items: Array<{ tag: string; n: number }>): string {
  if (items.length === 0) return `${label}：（还没有）`
  return `${label}：${items.map((item) => `${item.tag} ${item.n}`).join('、')}`
}

export function buildFreeTextPrompt(input: {
  userText: string
  entries: readonly Entry[]
}): string {
  const digest = memoryDigest(input.entries)

  const memory = [
    tallyLine('主题计数', digest.themes),
    tallyLine('情绪计数', digest.emotions),
    tallyLine('记下的具体东西', digest.clues),
    digest.recent.length > 0
      ? `最近留下的几条：${digest.recent.map((caption) => `「${caption}」`).join(' ')}`
      : '最近留下的几条：（还没有）',
  ].join('\n')

  return `${VOICE_RULES}

下面是这个人留下过的东西，仅供参考。不要逐条复述它，不要点评它，也不要假装你比它更懂他：
${memory}

他刚刚说：${input.userText}

只回一到两句话。如果上面没有和他这句相关的东西，就只回应他这句话本身，不要硬扯记忆。`
}

/** 去掉包裹的引号、折平空白、限长。模型很喜欢加引号和换行。 */
export function sanitizeReply(text: string): string {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“”'‘’「」《》]+/, '')
    .replace(/["“”'‘’「」《》]+$/, '')
    .trim()

  return cleaned.length > MAX_REPLY_CHARS ? `${cleaned.slice(0, MAX_REPLY_CHARS)}…` : cleaned
}

export function lineFromText(text: string): ScriptLine {
  return { parts: [t(text)], atMs: 0 }
}
