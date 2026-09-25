import { DAY_IN_MS } from '@/lib/time'

/**
 * 剧本。
 *
 * 黑客松最怕「演示时 AI 没找到」，所以这不是补丁，是一等公民：没有 Key、请求失败、
 * 模型返回不可解析，一律回落到这里。台词与分支逐句对齐参考稿 index_demo.html。
 *
 * 与参考稿最大的不同：**它不再自己编数字**。参考稿里 `stopCount = 4`（第 1111 行）
 * 和「提到这个项目 7 次」的 `7`（第 1132 行）都是裸字面量，没有任何计数器。
 * 这里改成由 ScriptContext 传入——数字来自 buildScriptContext() 对真实条目的聚合。
 * 所以剧本是「有参数的故事」，不是一份写死的台词表。
 *
 * 依赖方向：对话的数据形状（节点、台词、上下文）都定义在这一层，features/agent
 * 只负责把它跑起来。反过来引会绕成 data ↔ features 的循环。
 */

/* ---------- 台词 ---------- */

/** 一行台词由若干片段拼成。参考稿用 innerHTML 拼 `<b>` / `<br/>`，这里用真元素。 */
export type SayPart =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'break' }

export type ScriptLine = {
  parts: SayPart[]
  /** 旁白：视觉上更轻的那条灰色小字（参考稿的 .note）。 */
  note?: boolean
  /** 进入本节点后的第几毫秒浮现。节奏是剧本自己的属性，不散在组件里。 */
  atMs: number
  /** 这一行浮现后 520ms 插入 8/17 记忆卡片。 */
  card?: boolean
}

export const t = (text: string): SayPart => ({ kind: 'text', text })
export const b = (text: string): SayPart => ({ kind: 'strong', text })
export const br = (): SayPart => ({ kind: 'break' })

/* ---------- 分支 ---------- */

export type NodeId = 'opening' | 'want' | 'lost' | 'quiet' | 'sit'

export type ScriptReply = {
  id: string
  label: string
  quiet?: boolean
  go: NodeId
}

export type ScriptAction = { kind: 'startFocus' }

export type ScriptNode = {
  id: NodeId
  lines: ScriptLine[]
  /** 末行浮现后出现的选项；空数组 = 这个节点不可选。 */
  replies: ScriptReply[]
  /** 末行浮现后出现的按钮。 */
  action?: ScriptAction
}

/* ---------- 上下文：数字与记忆都由外面算好递进来 ---------- */

export type MemoryCardData = {
  /** 例：2026.08.17 21:40 · 21 秒（没有时长就不带后半段） */
  stamp: string
  /** 「那天你写下」/「那天你留下」——按条目的真实类型给，不一律说「写下」。 */
  meta: string
  caption: string
  mark: string
  sceneGradient: string
}

export type ScriptContext = {
  /** 过去 7 天里，带着「在开始前停下来」这个感觉的条目数。 */
  hesitateCount: number
  /** 提到那个项目的条目总数（不限 7 天）。 */
  mentionCount: number
  /** 检索到的 8/17 那条；找不到就是 null，此时 lost 分支换一套不提那天的台词。 */
  memory: MemoryCardData | null
}

/** 「过去 7 天」的窗口。 */
export const HESITATE_WINDOW_MS = 7 * DAY_IN_MS

/** 8/17 卡片要找的是哪一天。这是叙事锚点；内容全部从检索到的条目里读。 */
export const MEMORY_TARGET = new Date(2026, 7, 17, 21, 40, 0, 0).getTime()
export const MEMORY_TOLERANCE_MS = 2 * DAY_IN_MS

/* ---------- 节奏：逐值转录自 index_demo.html 的 setTimeout 链 ---------- */

const OPENING_AT = [200, 1900, 3800] as const
const WANT_AT = [600, 2100, 3900, 5600] as const
const LOST_AT = [600, 2300, 5000, 7100, 8800] as const
const QUIET_AT = [700, 2400] as const
const SIT_AT = [600, 2200, 4200] as const

/** LLM 没答上来时它说什么。不假装自己答过了——这正是「回落」该有的样子。 */
export const FALLBACK_LISTEN: ScriptLine = {
  parts: [t('嗯。'), br(), t('我先把这句留着。')],
  atMs: 0,
}

/* ---------- 组图 ---------- */

function openingLine2(ctx: ScriptContext): ScriptLine {
  // 数不出来就别印 0：0 次也是一种判定，而这个产品不做判定。
  if (ctx.hesitateCount <= 0) {
    return { parts: [t('你最近没有在开始工作之前停下来过。')], note: true, atMs: OPENING_AT[1] }
  }
  return {
    parts: [
      t('你过去 7 天，有 '),
      b(String(ctx.hesitateCount)),
      t(' 次在开始工作之前停下来。'),
    ],
    note: true,
    atMs: OPENING_AT[1],
  }
}

export function buildScript(ctx: ScriptContext): Record<NodeId, ScriptNode> {
  const lostSecond: ScriptLine = ctx.memory
    ? { parts: [t('你还记得 8 月 17 日吗？')], atMs: LOST_AT[1], card: true }
    : { parts: [t('有些日子你也是这样。什么都没做。')], note: true, atMs: LOST_AT[1] }

  const lostThird: ScriptLine = ctx.memory
    ? { parts: [t('那天你也是这样。什么都没做，但我替你留住了它。')], note: true, atMs: LOST_AT[2] }
    : { parts: [t('那些时刻我都替你留着了。')], note: true, atMs: LOST_AT[2] }

  return {
    opening: {
      id: 'opening',
      lines: [
        { parts: [t('我开始认识你了。')], atMs: OPENING_AT[0] },
        openingLine2(ctx),
        {
          parts: [t('我很好奇 ——'), br(), t('你真正不想做的，是什么？')],
          atMs: OPENING_AT[2],
        },
      ],
      replies: [
        { id: 'want', label: '其实我还是想把这个项目做出来。', go: 'want' },
        { id: 'lost', label: '我也不知道。', go: 'lost' },
        { id: 'quiet', label: '还不想说。', quiet: true, go: 'quiet' },
      ],
    },

    want: {
      id: 'want',
      lines: [
        { parts: [t('嗯。')], atMs: WANT_AT[0] },
        {
          parts: [t('你已经提到这个项目 '), b(String(ctx.mentionCount)), t(' 次了。')],
          note: true,
          atMs: WANT_AT[1],
        },
        { parts: [t('我猜，你不是不想做。')], atMs: WANT_AT[2] },
        { parts: [t('那现在，要不要试 3 分钟？')], atMs: WANT_AT[3] },
      ],
      replies: [],
      action: { kind: 'startFocus' },
    },

    lost: {
      id: 'lost',
      lines: [
        { parts: [t('没关系。')], atMs: LOST_AT[0] },
        lostSecond,
        lostThird,
        { parts: [t('你不是做不好。'), br(), t('你只是需要先停一会儿。')], atMs: LOST_AT[3] },
        { parts: [t('那现在，要不要试 3 分钟？')], atMs: LOST_AT[4] },
      ],
      replies: [],
      action: { kind: 'startFocus' },
    },

    quiet: {
      id: 'quiet',
      lines: [
        { parts: [t('好。')], atMs: QUIET_AT[0] },
        {
          parts: [t('我先把这些留着。'), br(), t('你想说的时候，这里都还在。')],
          note: true,
          atMs: QUIET_AT[1],
        },
      ],
      replies: [
        { id: 'quiet-want', label: '……其实我还是想做那个项目。', go: 'want' },
        { id: 'quiet-sit', label: '再陪我坐一会儿。', quiet: true, go: 'sit' },
      ],
    },

    sit: {
      id: 'sit',
      lines: [
        { parts: [t('好。')], atMs: SIT_AT[0] },
        { parts: [t('那就坐一会儿。'), br(), t('什么都不用做。')], atMs: SIT_AT[1] },
        { parts: [t('你拥有的时间，不需要被任何人使用。')], note: true, atMs: SIT_AT[2] },
      ],
      replies: [],
    },
  }
}
