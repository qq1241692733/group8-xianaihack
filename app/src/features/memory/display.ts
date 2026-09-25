import { formatDuration } from '@/lib/time'

import { KIND_LABEL, type Entry } from './types'

/**
 * 列表、痕迹、记忆卡片里那行主文案。
 * 文字条目加中文引号；没有文字的条目用中性描述，不替它编内容。
 */
export function captionOf(entry: Entry): string {
  if (entry.text) return entry.kind === 'word' ? `“${entry.text}”` : entry.text
  return KIND_LABEL[entry.kind]
}

/**
 * 副行。只回答「它是什么」，绝不出现「已完成」「第 N 天」这类累积说法。
 */
export function subOf(entry: Entry): string {
  if (entry.kind === 'sound') {
    return entry.durationMs ? `环境声音 · ${formatDuration(entry.durationMs)}` : '环境声音'
  }
  return KIND_LABEL[entry.kind]
}
