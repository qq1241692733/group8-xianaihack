import { dayKey, formatDayLabel } from '@/lib/time'

import type { Entry, EntryKind } from './types'

/**
 * 时间流的分组。两件事：
 *
 *  ① **一次落下的几条（共享 momentId）收成一个节点**——它们是「一件事」，
 *     摊成三行就把那件事拆散了（见 docs/15 §五）。
 *  ② 节点按天分组，分组只说今天 / 昨天 / 某月某日，不报条数。
 *
 * 一个「此刻」的位置取其中**最新的一条**：这件事落在它最后发生的那一刻。
 * （库里那张照片可能带 EXIF 更早的拍摄时间，但这件事是此刻发生的。）
 *
 * 纯函数，好测。屏上不出现任何计数——列表本身就摆在那里，不需要再报一遍数。
 */

export interface TimelineNode {
  key: string
  /** 这条节点的时间：单条就是它自己，一个「此刻」取其中最新的一条。 */
  at: number
  /** createdAt 倒序。单条时长度为 1。 */
  entries: Entry[]
  /** 有值 = 这是一次原子提交收成的一条，展开才看得到里面的几条。 */
  momentId?: string
}

export interface TimelineDay {
  key: string
  label: string
  nodes: TimelineNode[]
}

export function buildTimeline(
  entries: readonly Entry[],
  filter: 'all' | EntryKind,
): TimelineDay[] {
  const list = entries.filter((entry) => filter === 'all' || entry.kind === filter)

  const nodes: TimelineNode[] = []
  const byMoment = new Map<string, TimelineNode>()

  for (const entry of list) {
    const momentId = entry.momentId
    if (!momentId) {
      nodes.push({ key: entry.id, at: entry.createdAt, entries: [entry] })
      continue
    }
    const existing = byMoment.get(momentId)
    if (existing) {
      existing.entries.push(entry)
      continue
    }
    const node: TimelineNode = { key: momentId, at: entry.createdAt, entries: [entry], momentId }
    byMoment.set(momentId, node)
    nodes.push(node)
  }

  for (const node of nodes) {
    node.entries.sort((a, b) => b.createdAt - a.createdAt)
    node.at = node.entries[0]?.createdAt ?? node.at
  }

  nodes.sort((a, b) => b.at - a.at)

  const days: TimelineDay[] = []
  for (const node of nodes) {
    const key = dayKey(node.at)
    const last = days[days.length - 1]
    if (last && last.key === key) last.nodes.push(node)
    else days.push({ key, label: formatDayLabel(node.at), nodes: [node] })
  }
  return days
}
