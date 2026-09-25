import type { MemoryCardData, ScriptLine, ScriptReply } from '@/data/script'

/**
 * 对话在运行时的形状。
 *
 * 与 data/script.ts 的分工：那边是「故事怎么讲」（台词、分支、节奏），
 * 这边是「讲到哪儿了」（已浮现的消息、待浮现的队列）。
 */

/** 已经出现在流里的东西。 */
export type AiMessage =
  | { id: string; kind: 'ai'; line: ScriptLine }
  | { id: string; kind: 'me'; text: string }
  | { id: string; kind: 'card'; card: MemoryCardData }
  | { id: string; kind: 'action' }

/**
 * 还没浮现的。`gapMs` 是「距上一项多久之后出现」——相对量，不是绝对时刻。
 * 队列存在 store 里，切 Tab 不丢、可以续播（见 useAiDialogue）。
 */
export type QueuedItem =
  | { kind: 'ai'; line: ScriptLine; gapMs: number }
  | { kind: 'card'; card: MemoryCardData; gapMs: number }
  | { kind: 'replies'; replies: ScriptReply[]; gapMs: number }
  | { kind: 'action'; gapMs: number }
