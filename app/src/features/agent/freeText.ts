import { FALLBACK_LISTEN, type ScriptLine } from '@/data/script'
import type { Entry } from '@/features/memory/types'

import { askLlm, type LlmResult } from './client'
import { buildFreeTextPrompt, lineFromText, sanitizeReply } from './prompt'

export type AskFn = (prompt: string) => Promise<LlmResult>

/**
 * 自由输入那一路。预设选项走剧本（要确定性），只有这里走模型。
 *
 * `ask` 可注入，测试不必碰网络。失败、答空、清洗后为空——一律回落
 * FALLBACK_LISTEN。回落不是兜底补丁，是这个产品对「AI 没答上来」的正式回答方式：
 * 坦白地说自己只是听着，而不是编一句听起来很像理解的话。
 */
export async function askFreeText(
  input: { userText: string; entries: readonly Entry[] },
  ask: AskFn = askLlm,
): Promise<ScriptLine> {
  const result = await ask(buildFreeTextPrompt(input))
  if (!result.ok) return FALLBACK_LISTEN

  const text = sanitizeReply(result.text)
  return text ? lineFromText(text) : FALLBACK_LISTEN
}
