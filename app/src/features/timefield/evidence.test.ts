import { describe, expect, it } from 'vitest'

import { createEmptyTags, type Entry, type EntryKind } from '@/features/memory/types'

import { evidenceLine, levelOf, MAX_ORB_LEVEL } from './evidence'

const DAY = 24 * 60 * 60 * 1000
/** 固定一个「今天 00:00」，让断言不受运行时刻影响。 */
const DAY_START = new Date(2026, 8, 26, 0, 0, 0, 0).getTime()

function entry(kind: EntryKind, at: number, text?: string): Entry {
  const e: Entry = { id: `${kind}-${at}`, kind, createdAt: at, tags: createEmptyTags(), tagSource: 'seed' }
  if (text) e.text = text
  return e
}

describe('球下那句（生活证据）', () => {
  it('今天什么都没留时，只陈述，不催', () => {
    expect(evidenceLine([], DAY_START)).toEqual({ text: '今天还没有留下什么。', lit: false })
  })

  it('昨天的记录不算「今天」', () => {
    const yesterday = DAY_START - DAY
    expect(evidenceLine([entry('word', yesterday, '早睡的第二天')], DAY_START).lit).toBe(false)
  })

  it('取今天最新的那一条，带上时间戳', () => {
    const list = [
      entry('word', DAY_START + 9 * 3600_000, '上午写的'),
      entry('sound', DAY_START + 18 * 3600_000 + 32 * 60_000),
      entry('word', DAY_START + 12 * 3600_000, '中午写的'),
    ]
    const ev = evidenceLine(list, DAY_START)
    expect(ev.lit).toBe(true)
    // 18:32 · 声音（声音没转写，captionOf 退回种类名）
    expect(ev.text).toBe('18:32 · 声音')
  })

  it('一句话带中文引号，与时间页同一套口径', () => {
    const ev = evidenceLine([entry('word', DAY_START + 8 * 3600_000 + 5 * 60_000, '终于没人找我了')], DAY_START)
    expect(ev.text).toBe('08:05 · “终于没人找我了”')
  })
})

describe('密度级', () => {
  it('空库是 0 —— 一颗都不亮', () => {
    expect(levelOf([])).toBe(0)
  })

  it('13 条种子落在中段，不会一上来就满', () => {
    const seeds = Array.from({ length: 13 }, (_, i) => entry('word', DAY_START + i))
    expect(levelOf(seeds)).toBe(6)
  })

  it('封顶在 MAX_ORB_LEVEL', () => {
    const many = Array.from({ length: 400 }, (_, i) => entry('word', DAY_START + i))
    expect(levelOf(many)).toBe(MAX_ORB_LEVEL)
  })
})
