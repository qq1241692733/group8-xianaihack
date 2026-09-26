import type { DiscoveryCard } from '@/data/discoveries'
import type { ScriptLine } from '@/data/script'

/**
 * 对话在运行时的形状——现在只有两种东西：
 *  ① 你说的一句话（`me`）；
 *  ② 本地查询 / 成册判定给你的回执（`volume` / `volumes`）。
 *
 * 原来这里还有一整套「故事怎么讲」（脚本分支、回复选项、并列出口、推荐语档案），
 * 连同 `useAiDialogue` / `PROMPT_GROUPS` 一起删掉了：理解页现在是一个**找回线索的入口**，
 * 不再走一条写死的戏。
 */

/** 已经出现在流里的东西。 */
export type AiMessage =
  | { id: string; kind: 'ai'; line: ScriptLine }
  | { id: string; kind: 'me'; text: string }
  /** 一册的回执（docs/23 §三）。draft = 草稿（留下才存在）；
   *  非草稿 = 已有册（翻开来）。动作由状态决定，不由意图决定。 */
  | { id: string; kind: 'volume'; card: DiscoveryCard; draft: boolean }
  /** 多册回执：册架的缩影，行列表。点行原地展开成单册回执。 */
  | { id: string; kind: 'volumes'; cards: DiscoveryCard[]; draft: boolean }

/**
 * 还没浮现的。`gapMs` 是「距上一项多久之后出现」——相对量，不是绝对时刻。
 * 队列存在 store 里，切 Tab 不丢、可以续播（见 useAiQueue）。
 */
export type QueuedItem =
  | { kind: 'ai'; line: ScriptLine; gapMs: number }
  | { kind: 'volume'; card: DiscoveryCard; draft: boolean; gapMs: number }
  | { kind: 'volumes'; cards: DiscoveryCard[]; draft: boolean; gapMs: number }
