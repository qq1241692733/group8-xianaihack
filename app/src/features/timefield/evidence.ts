import { captionOf } from '@/features/memory/display'
import type { Entry } from '@/features/memory/types'
import { formatTimeOfDay } from '@/lib/time'

/**
 * 球下那句 —— 「生活证据」。
 *
 * 它替掉的原本是这个位置的一句数字语言（「今天，你拥有 2 小时 47 分钟」）。
 * 这里只陈述**发生了什么**：几点的、留下了什么。没有条数、没有时长、没有完成度。
 * 空的时候也不催（「今天还没有留下什么。」），因为「还没有」不是「欠着」。
 */
export interface Evidence {
  text: string
  lit: boolean
}

const EMPTY_LINE = '今天还没有留下什么。'

/**
 * `dayStart` 由调用方给（`startOfDay(now)`），不在这里取 `Date.now()` ——
 * 这是个纯函数，在渲染期调用，取值会让每次渲染都变，memo 也就失效了。
 */
export function evidenceLine(entries: readonly Entry[], dayStart: number): Evidence {
  const today = entries.filter((e) => e.createdAt >= dayStart)
  if (today.length === 0) return { text: EMPTY_LINE, lit: false }

  let newest = today[0]
  for (const e of today) {
    if (e.createdAt > newest.createdAt) newest = e
  }
  return { text: `${formatTimeOfDay(newest.createdAt)} · ${captionOf(newest)}`, lit: true }
}

/** 球最密到 9 级。再密下去网点会连成一片实心，球就没了「材质」。 */
export const MAX_ORB_LEVEL = 9

/**
 * 记录数 → 球的密度级。
 *
 * **这是全 App 唯一一处「数量影响界面」的地方，而它影响的只是密度** ——
 * 屏幕上不会出现那个数字。密度就是那个数字，只是不用写的。
 * 开方是为了压住前期：第一条记录带来的变化最明显，第 20 条几乎看不出来。
 */
export function levelOf(entries: readonly Entry[]): number {
  return Math.min(MAX_ORB_LEVEL, Math.floor(Math.sqrt(entries.length) * 1.7))
}
