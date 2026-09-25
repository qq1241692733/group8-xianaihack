import { SCENE_GRADIENT } from '@/features/capture/scene'
import { countByTheme, countSince, entryNearestDate } from '@/features/memory/aggregate'
import { captionOf } from '@/features/memory/display'
import { KIND_MARK, type Entry } from '@/features/memory/types'
import { formatDateCN, formatDuration, formatTimeOfDay } from '@/lib/time'

import {
  HESITATE_WINDOW_MS,
  MEMORY_TARGET,
  MEMORY_TOLERANCE_MS,
  type MemoryCardData,
  type ScriptContext,
} from '@/data/script'

/**
 * 把库里真实的条目，算成剧本要用的那几个数。
 *
 * 必须在「事件」里调用（store 的 action），不能放在渲染期：它会读 Date.now 之外的
 * 时间锚点，而 React 的 purity 规则不许渲染过程中做这种计算。
 */

/**
 * 「在开始工作之前停下来」按 emotion `逃避` 判定，**不是** theme `工作`。
 *
 * 这不是随手挑的：种子第 5 行「我又在逃避了。」只带 theme `自我`，
 * 按 `工作` 判会把它漏掉，数字就少一个。感觉才是这件事的准绳。
 */
const HESITATE_EMOTION = '逃避'

/** 「提到这个项目」——项目是一个具体的东西，按 theme 数得清楚。 */
const MENTION_THEME = '项目'

function cardOf(entry: Entry): MemoryCardData {
  const when = `${formatDateCN(entry.createdAt)} ${formatTimeOfDay(entry.createdAt)}`
  return {
    // 有时长才带时长。参考稿在一条 word 条目上硬写了「21 秒」，那是编的。
    stamp: entry.durationMs ? `${when} · ${formatDuration(entry.durationMs)}` : when,
    meta: entry.kind === 'word' ? '那天你写下' : '那天你留下',
    caption: captionOf(entry),
    mark: KIND_MARK[entry.kind],
    sceneGradient: SCENE_GRADIENT,
  }
}

/**
 * `anchorTs` 是「现在」——由调用方在 hydrate 时取一次，不在这里现取。
 * 一个每渲染一次就漂移的窗口，会让 7 天边界上的条目时有时无。
 */
export function buildScriptContext(entries: readonly Entry[], anchorTs: number): ScriptContext {
  const memoryEntry = entryNearestDate(entries, MEMORY_TARGET, MEMORY_TOLERANCE_MS)

  return {
    hesitateCount: countSince(entries, anchorTs - HESITATE_WINDOW_MS, (entry) =>
      entry.tags.emotions.includes(HESITATE_EMOTION),
    ),
    mentionCount: countByTheme(entries, MENTION_THEME),
    memory: memoryEntry ? cardOf(memoryEntry) : null,
  }
}
