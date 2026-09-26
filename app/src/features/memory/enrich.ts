import { askLlmVision, type LlmResult } from '@/features/agent/client'
import { extractJson } from '@/features/agent/llmJson'

import { parseLlmTags } from './tags.schema'
import type { EntryTags } from './types'
import { vocabList } from './vocabulary'

/**
 * 视觉 LLM 增强层（C 层）。
 *
 * 只在用户显式开启时被调用，且只发生在**落库之后**：本地标签（规则 + 元数据）
 * 已经写死在库里，这里成功就回写、失败就什么都不做。所以 LLM 掉线不影响
 * 「照片有标签」这件事实——tagSource 保持 'rule'，绝不假装 LLM 看过。
 *
 * ⚠️ 这是全项目唯一让记录**离开设备**的地方。缓解见 store.ts 的 visionEnabled
 * 与 toVisionDataUrl（只发 512px、重编码、无 EXIF/GPS 的缩图）。
 */

export type AskVisionFn = (prompt: string, image: string) => Promise<LlmResult>

/**
 * 固定的画面描述提示词。不拼接任何变量（词表除外——它来自 vocabulary.ts，是常量）。
 *
 * 两重约束：
 *  - **自由的部分**（scene + clues）：只写看得见的，认不出的人/地方不命名，不猜关系不猜心情。
 *    **但要写细**。认识这张照片**只有这一次**机会——此刻没写下来的东西以后再也追不回来
 *    （一张照片的「第一次」、一个物件的来历，全都靠这里留下的字）。所以不是「拿不准就少写」，
 *    是「看得见就写下来」。
 *  - **受控的部分**（四个归类字段）：只能从固定词表里选，选不出就留空。
 *    词表由代码定义，模型只负责「从里面挑哪一个」——它的自由度用在描述与线索上，
 *    不用在给这四个维度造词上（造出来的词本地判据比不中）。
 *
 * `clues` 是这两者之间的桥：它**不受词表限制**，专门装具体的物、场合、动作
 * （「马克杯」「缆车」「栈道」）。这些词机器照样能按子串搜到，而它们才是
 * 长跨度合集的抓手——详见 types.ts 的 EntryTags.clues。
 */
export function buildVisionPrompt(): string {
  return [
    '你在为一张照片写「画面记录」，它以后要靠这段字被重新找到。只写画面里能确认的东西。',
    '',
    '**scene**：一到两句话，把画面写具体 —— 有什么东西、在做什么、在什么地方、什么光线。',
    '- 具体优于笼统：「桌上一只白瓷马克杯，杯口有茶渍」比「一个杯子」有用得多。',
    '- 只描述看得见的：光线、物体、场景、天气、颜色、动作。',
    '- 认不出的人或地方不要命名；不猜人物关系，不评价，',
    '  不用「美好 / 治愈 / 值得 / 温馨」这类词。',
    '- 完全看不清就写「看不清的画面」。',
    '',
    '**clues**：把画面里**具体的东西**拆成短词，用来做线索。这是最要紧的一项。',
    '- 名词、物件、场合、动作，每个 2–6 个字：「马克杯」「办公桌」「缆车」「台阶」「雨伞」。',
    '- 不受任何词表限制，看到什么写什么；**宁可多写几个**。',
    '- 不要写抽象评价词（「宁静」「治愈」），不要写整句。看不出来就给空数组。',
    '',
    '四个归类字段**只能从下面的词里选**，一个都不合适就留空数组，不要自己造词',
    '（造出来的词检索比不中；那些具体的东西请放进 clues，不要塞进这四项）：',
    `- themes（主题）：${vocabList('themes')}`,
    `- emotions（情绪）：${vocabList('emotions')}`,
    `- people（人物）：${vocabList('people')}`,
    `- places（地点）：${vocabList('places')}`,
    '',
    '其中 emotions 要求最严：只有画面里明显看得出（比如在哭、在大笑）才填，',
    '其余一律留空——不要从风景、光线或构图去猜心情。',
    '',
    '只输出 JSON，不要解释、不要代码块：',
    '{"scene":"一到两句具体的画面描述","clues":["具体的东西","短词"],"themes":[],"emotions":[],"people":[],"places":[]}',
  ].join('\n')
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])]
}

/**
 * 本地标签 + LLM 标签的合并规则（纯函数）。
 *
 * scene 用 LLM 的（它真看过画面，比亮度色温准）；LLM 没给就保留本地那句。
 * 五个数组做并集去重——本地不丢，LLM 补上它认出的。
 */
export function mergeLlmTags(local: EntryTags, llm: EntryTags): EntryTags {
  return {
    scene: llm.scene.trim() ? llm.scene : local.scene,
    themes: union(local.themes, llm.themes),
    emotions: union(local.emotions, llm.emotions),
    people: union(local.people, llm.people),
    places: union(local.places, llm.places),
    clues: union(local.clues, llm.clues),
  }
}

/**
 * 一张照片 → LLM 标签。任何一步失败都返回 null，调用方保持本地标签。
 * 校验复用 parseLlmTags（严格、缺字段即失败）。
 */
export async function enrichPhotoTags(
  input: { dataUrl: string; local: EntryTags },
  ask: AskVisionFn = askLlmVision,
): Promise<EntryTags | null> {
  const result = await ask(buildVisionPrompt(), input.dataUrl)
  if (!result.ok) return null
  const json = extractJson(result.text)
  if (json === null) return null
  return parseLlmTags(json)
}
