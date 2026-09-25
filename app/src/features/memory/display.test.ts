import { describe, expect, it } from 'vitest'

import { formatDuration, formatElapsed, formatDayLabel } from '@/lib/time'

import { captionOf, subOf } from './display'
import { createEmptyTags, type Entry, type EntryKind } from './types'

function entry(kind: EntryKind, patch: Partial<Entry> = {}): Entry {
  return {
    id: `t_${kind}`,
    kind,
    createdAt: Date.UTC(2026, 8, 25, 10, 0),
    tags: createEmptyTags(),
    tagSource: 'rule',
    ...patch,
  }
}

describe('captionOf', () => {
  it('文字条目包上中文引号', () => {
    expect(captionOf(entry('word', { text: '我又在逃避了。' }))).toBe('“我又在逃避了。”')
  })

  it('声音转写不加引号', () => {
    expect(captionOf(entry('sound', { text: '外面在下雨。' }))).toBe('外面在下雨。')
  })

  it('没有文字时不替它编内容', () => {
    expect(captionOf(entry('sound'))).toBe('声音')
    expect(captionOf(entry('photo'))).toBe('照片')
  })

  it('用户输入里的尖括号原样保留，不做解释', () => {
    const nasty = '<img src=x onerror=alert(1)>'
    expect(captionOf(entry('word', { text: nasty }))).toBe(`“${nasty}”`)
  })
})

describe('subOf', () => {
  it('声音只回答它有多长', () => {
    expect(subOf(entry('sound', { durationMs: 22_000 }))).toBe('环境声音 · 22 秒')
  })

  it('绝不出现累积或完成类说法', () => {
    const text = subOf(entry('word', { text: 'x' }))
    expect(text).not.toMatch(/完成|已|连续|第\s*\d+\s*天/)
  })
})

describe('时间格式', () => {
  it('录音计时会进位，不会出现 00:60', () => {
    expect(formatElapsed(7_000)).toBe('00:07')
    expect(formatElapsed(59_000)).toBe('00:59')
    expect(formatElapsed(60_000)).toBe('01:00')
    expect(formatElapsed(83_000)).toBe('01:23')
    expect(formatElapsed(3_723_000)).toBe('62:03')
  })

  it('时长文案超过一分钟会换算', () => {
    expect(formatDuration(22_000)).toBe('22 秒')
    expect(formatDuration(60_000)).toBe('1 分')
    expect(formatDuration(83_000)).toBe('1 分 23 秒')
  })

  it('分组只说今天/昨天/某月某日，不说「第 N 天」', () => {
    const now = new Date(2026, 8, 25, 12, 0).getTime()
    expect(formatDayLabel(now, now)).toBe('今天')
    expect(formatDayLabel(new Date(2026, 8, 24, 9, 0).getTime(), now)).toBe('昨天')
    expect(formatDayLabel(new Date(2026, 8, 1, 9, 0).getTime(), now)).toBe('9 月 1 日')
  })
})
