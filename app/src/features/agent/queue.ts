import type { ScriptContext, ScriptNode } from '@/data/script'

import type { QueuedItem } from './types'

/** 参考稿里 aiSay 的回调固定延迟 520ms：卡片、选项、按钮都在这一刻冒出来。 */
const TERMINAL_GAP_MS = 520

/**
 * 把一个节点展开成待浮现的队列。
 *
 * 纯函数——节奏因此可以单测，不必去跑定时器。参考稿把节奏藏在 setTimeout 链的
 * 返回值里（`return delay + 1200`），读不出来也测不了；这里把它摊平成数字。
 *
 * `leadMs` 只加在第一项上：点击选项后参考稿要等 700ms 才进下一个分支，
 * 那 700ms 属于「分支切换」，不属于分支内部的第一句台词。
 */
export function enqueueNode(node: ScriptNode, ctx: ScriptContext, leadMs = 0): QueuedItem[] {
  const items: QueuedItem[] = []
  let previousAt = 0

  for (const line of node.lines) {
    const gap = line.atMs - previousAt
    items.push({ kind: 'ai', line, gapMs: items.length === 0 ? gap + leadMs : gap })
    previousAt = line.atMs

    if (line.card && ctx.memory) {
      items.push({ kind: 'card', card: ctx.memory, gapMs: TERMINAL_GAP_MS })
      previousAt += TERMINAL_GAP_MS
    }
  }

  if (node.replies.length > 0) {
    items.push({ kind: 'replies', replies: node.replies, gapMs: TERMINAL_GAP_MS })
  } else if (node.action) {
    items.push({ kind: 'action', gapMs: TERMINAL_GAP_MS })
  }

  return items
}
