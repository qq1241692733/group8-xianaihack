/** 时间格式化。全部按本地时区，不做 UTC 换算——这是一款关于"此刻"的产品。 */

const WEEK = ['日', '一', '二', '三', '四', '五', '六'] as const
const DAY_MS = 24 * 60 * 60 * 1000

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

/** 19:42 */
export function formatClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 07 —— 秒，单独显示在时钟右上角 */
export function formatSeconds(d: Date): string {
  return pad2(d.getSeconds())
}

/** 2026 年 9 月 24 日 · 星期四 */
export function formatDayline(d: Date): string {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEK[d.getDay()]}`
}

/** 时间戳 → 19:42 */
export function formatTimeOfDay(ts: number): string {
  return formatClock(new Date(ts))
}

/** 时间戳 → 2026.08.17 */
export function formatDateCN(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 用于分组的稳定键：2026-09-25 */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * 时间流的分组标签。
 * 刻意只给「今天 / 昨天 / 9 月 24 日」，不出现"第 N 天"这类累积感说法。
 */
export function formatDayLabel(ts: number, now: number = Date.now()): string {
  const today = startOfDay(now)
  const day = startOfDay(ts)
  if (day === today) return '今天'
  if (day === today - DAY_MS) return '昨天'
  const d = new Date(ts)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/**
 * 时长文案。
 * 注意这里只回答"这段声音有多长"，不回答"你专注了多久"——后者不属于本产品。
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} 秒`
  const m = Math.floor(total / 60)
  const s = total % 60
  return s === 0 ? `${m} 分` : `${m} 分 ${pad2(s)} 秒`
}

/** 秒 → 03:00（3 分钟专注的倒计时） */
export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  return `${Math.floor(safe / 60)}:${pad2(safe % 60)}`
}

export const DAY_IN_MS = DAY_MS

/**
 * 录音计时：00:07 一路走到 01:23。
 * 原单文件版是 "00:" + pad(秒)，超过 59 秒会显示 00:60 / 00:61 —— 这里是真进位。
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}
