import { KIND_LABEL, type Entry } from '@/features/memory/types'
import { z } from 'zod'

import { askLlm, type LlmResult } from './client'
import { extractJson } from './llmJson'

/**
 * 两步成册：本地召回候选组 → LLM 判定「这些是不是一件事」。
 *
 * 分工（docs/23 §四 定下的那条线）：
 *  - **召回（本地、确定性）**：哪些记录「可能」属于一册。这里用时间邻近——「事件」
 *    本质上是有起止的一段时间（去爬山 = 上午到下午），时间是最诚实的边界，
 *    不依赖标签是否恰好命中。
 *  - **判定（LLM）**：这几条「是不是」一件事、叫什么、属于哪类。模型看的是每条记录的
 *    **描述 + 标签**（视觉 LLM 写入时已产出），不重传图片——同一张图不值得付两次费。
 *
 * 模型**有权说不**（worth:false）——这就是「有价值的场景才成册」的落点：值不值得归档
 * 由模型判断，而不是本地拍一个阈值。判定通过也只是**草稿**，要用户按下「留下」才成立。
 */

export type AskFn = (prompt: string) => Promise<LlmResult>

export interface DossierCandidate {
  entries: Entry[]
  from: number
  to: number
}

/** 相邻两条超过这个间隔就切开——一次外出/一件事的天然边界。 */
export const DEFAULT_GAP_MS = 6 * 3600 * 1000

/**
 * 按时间邻近把记录切成候选组。≥2 条才算候选（一条不叫联系），最近的组在前。
 * 纯函数、离线、可测。
 */
export function candidateGroups(
  entries: readonly Entry[],
  gapMs = DEFAULT_GAP_MS,
): DossierCandidate[] {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt)

  const groups: Entry[][] = []
  for (const entry of sorted) {
    const last = groups[groups.length - 1]
    const prev = last?.[last.length - 1]
    if (last && prev && entry.createdAt - prev.createdAt <= gapMs) last.push(entry)
    else groups.push([entry])
  }

  return groups
    .filter((group) => group.length >= 2)
    .map((group) => ({
      entries: group,
      from: group[0]!.createdAt,
      to: group[group.length - 1]!.createdAt,
    }))
    .sort((a, b) => b.to - a.to)
}

const pad2 = (n: number) => (n < 10 ? '0' : '') + n

/** 一条记录 → 一行给模型看的描述，前面带序号（模型用它回填 members）。 */
function describeEntry(entry: Entry, index: number): string {
  const d = new Date(entry.createdAt)
  const head = `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${KIND_LABEL[entry.kind]}`

  const body: string[] = []
  if (entry.tags.scene) body.push(`画面：${entry.tags.scene}`)
  if (entry.text) body.push(`原话：「${entry.text}」`)

  const tags = [
    entry.tags.places.length ? `地点:${entry.tags.places.join('/')}` : '',
    entry.tags.themes.length ? `主题:${entry.tags.themes.join('/')}` : '',
    entry.tags.people.length ? `人物:${entry.tags.people.join('/')}` : '',
    entry.tags.emotions.length ? `情绪:${entry.tags.emotions.join('/')}` : '',
    // 自由线索也发给模型：它是「这几条到底在说同一个东西吗」最有力的证据
    // （同一个「马克杯」出现在几条里，比「都在家」有力得多）。
    entry.tags.clues.length ? `线索:${entry.tags.clues.join('/')}` : '',
  ].filter(Boolean)

  return `[${index + 1}] ${head}  ${body.join('  ')}${tags.length ? `  [${tags.join('][')}]` : ''}`
}

/**
 * 判定提示词。事件优先，明确授权拒绝（「不值得」是合法且重要的输出），
 * 并允许挑选子集——组里不属于这件事的记录可以剔出去。
 */
export function buildDossierPrompt(group: DossierCandidate): string {
  const d = new Date(group.from)
  const day = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`

  return [
    `下面是这个人在 ${day} 前后留下的一些记录。判断它们是不是「同一件事」，够不够格归档成一册。`,
    '',
    '按这个优先级：',
    '1. 事件（做了什么）：爬山、看展、聚餐、加班到深夜……',
    '2. 情绪 + 事件：一件事带着明确的情绪，如「爬完山很累，但很松快」',
    '3. 凑不成一件事、或只是零散的记录 → 不值得成册',
    '',
    '册名要像人说的话（「去爬山那天」），不要「记录合集」这种。',
    '不要猜记录里没写的东西。拿不准就说不值得。',
    '只有一部分记录属于这件事时，只挑那一部分（其余剔出去）。',
    '',
    '记录：',
    ...group.entries.map(describeEntry),
    '',
    '只输出 JSON，不要解释、不要代码块：',
    '{"worth":true,"kind":"event","title":"","note":"","members":[1,2,3]}',
    'kind 只能是 "event"（纯事件）或 "mixed"（情绪+事件）。',
    'members 填属于这一册的记录序号（方括号里那个数）。worth 为 false 时给空数组。',
  ].join('\n')
}

export interface DossierVerdict {
  worth: boolean
  kind: 'event' | 'mixed'
  title: string
  note: string
  /** 属于这一册的记录序号（1 起，对应提示词里的 [n]）。两侧越界与重复由调用方处理。 */
  members: number[]
}

/** 刻意不设 default：模型少给字段就是一次不合格返回，判失败而非替它编。 */
const DossierSchema = z.object({
  worth: z.boolean(),
  kind: z.enum(['event', 'mixed']),
  title: z.string(),
  note: z.string(),
  members: z.array(z.number().int()),
})

export function parseDossier(raw: unknown): DossierVerdict | null {
  const parsed = DossierSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * 把模型回填的序号翻译成真实的记录。越界 / 重复都挡掉（**边界由代码把控，不信模型**）。
 * 一条都没对上时回落到整组——召回本来就已按时间框定过，不至于空手。
 */
export function membersOf(group: DossierCandidate, verdict: DossierVerdict): Entry[] {
  const picked = [...new Set(verdict.members)]
    .map((n) => group.entries[n - 1])
    .filter((entry): entry is Entry => entry !== undefined)
  return picked.length > 0 ? picked : group.entries
}

/**
 * 一个候选组 → 一个判定。任何一步失败（请求失败 / 不是 JSON / 缺字段）返回 null，
 * 调用方当作「这次没答上来」，什么都不做（本地判据册照常）。
 */
export async function judgeGroup(
  group: DossierCandidate,
  ask: AskFn = askLlm,
): Promise<DossierVerdict | null> {
  const result = await ask(buildDossierPrompt(group))
  if (!result.ok) return null
  const json = extractJson(result.text)
  if (json === null) return null
  return parseDossier(json)
}
