import { DAY_IN_MS } from '@/lib/time'

/**
 * 台词的原语，以及**回落句**。
 *
 * 这里原来是一整份剧本（开场逐句、三条分支、并列出口、推荐语库），逐句对齐参考稿。
 * 那套东西连同 `useAiDialogue`、`buildScriptContext`、`PROMPT_GROUPS` 一起删了：
 * 理解页现在是一个**找回线索的入口**，不再是「一条写死的戏」。
 *
 * 留下来的只有三样，每一样都还有活的用场：
 *  ① 台词的原语（`SayPart` / `ScriptLine` / `t`）——回执与消息仍然由它们拼；
 *  ② `FALLBACK_LISTEN`——**AI 没答上来时它说什么**，还是那句话：不假装自己答过了；
 *  ③ 记忆锚点（`MEMORY_TARGET` 等）——对账测试仍拿它验种子里的 8/17 那条真的存在。
 *
 * 依赖方向不变：数据形状定义在这一层，features/agent 只负责把它跑起来。
 */

/* ---------- 台词 ---------- */

/** 一行台词由若干片段拼成。参考稿用 innerHTML 拼 `<b>` / `<br/>`，这里用真元素。 */
export type SayPart =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'break' }

export type ScriptLine = {
  parts: SayPart[]
  /** 旁白：视觉上更轻的那条灰色小字。 */
  note?: boolean
  /** 浮现时刻。节奏是台词自己的属性，不散在组件里。 */
  atMs: number
}

export const t = (text: string): SayPart => ({ kind: 'text', text })
export const br = (): SayPart => ({ kind: 'break' })

/**
 * 记忆锚点。原来它们是剧本里那句「你还记得 8 月 17 日吗？」的坐标；
 * 剧本删了，但**对账测试还拿它们验种子**——那条规定没变：演示里的每个数字
 * 都要能从库存里数出来（见 docs/03 §九）。
 */
export const HESITATE_WINDOW_MS = 7 * DAY_IN_MS
export const MEMORY_TARGET = new Date(2026, 7, 17, 21, 40, 0, 0).getTime()
export const MEMORY_TOLERANCE_MS = 2 * DAY_IN_MS

/** LLM 没答上来时它说什么。不假装自己答过了——这正是「回落」该有的样子。 */
export const FALLBACK_LISTEN: ScriptLine = {
  parts: [t('嗯。'), br(), t('我先把这句留着。')],
  atMs: 0,
}
