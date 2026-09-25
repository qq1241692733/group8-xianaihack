import { describe, expect, it } from 'vitest'

import {
  countByEmotion,
  countByTag,
  countByTheme,
  countSince,
  entriesSince,
  entryNearestDate,
  memoryDigest,
} from './aggregate'
import { createEmptyTags, type Entry, type EntryKind } from './types'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 25, 12, 0)

function make(kind: EntryKind, createdAt: number, patch: Partial<Entry> = {}): Entry {
  return {
    id: `t_${createdAt}_${kind}`,
    kind,
    createdAt,
    tags: createEmptyTags(),
    tagSource: 'rule',
    ...patch,
  }
}

function withTags(kind: EntryKind, createdAt: number, tags: Partial<Entry['tags']>): Entry {
  return make(kind, createdAt, { tags: { ...createEmptyTags(), ...tags } })
}

describe('计数', () => {
  const entries = [
    withTags('word', NOW - 1 * DAY, { themes: ['项目', '工作'], emotions: ['逃避'] }),
    withTags('word', NOW - 2 * DAY, { themes: ['项目'], emotions: ['疲惫'] }),
    withTags('word', NOW - 20 * DAY, { themes: ['项目'], emotions: ['自责'] }),
    withTags('sound', NOW - 3 * DAY, { emotions: ['逃避'] }),
  ]

  it('按主题 / 情绪 / 任意维度数', () => {
    expect(countByTheme(entries, '项目')).toBe(3)
    expect(countByEmotion(entries, '逃避')).toBe(2)
    expect(countByTag(entries, 'themes', '工作')).toBe(1)
    expect(countByTag(entries, 'places', '家')).toBe(0)
  })

  it('countSince 的窗口起点含在窗口内', () => {
    // 恰好在边界上的那条（NOW - 1 DAY）要被算进来
    expect(countSince(entries, NOW - DAY)).toBe(1)
    // 窗口往后挪 1 毫秒，边界那条就被排除
    expect(countSince(entries, NOW - DAY + 1)).toBe(0)
  })

  it('countSince 可带判定', () => {
    expect(countSince(entries, NOW - 7 * DAY, (e) => e.tags.emotions.includes('逃避'))).toBe(2)
  })

  it('entriesSince 不修改入参', () => {
    const before = JSON.stringify(entries)
    entriesSince(entries, NOW - 7 * DAY)
    expect(JSON.stringify(entries)).toBe(before)
  })
})

describe('精确日期检索', () => {
  it('容差内取最近的一条', () => {
    const near = make('word', NOW + 1000)
    const far = make('word', NOW + 5000)
    expect(entryNearestDate([far, near], NOW, 10_000)?.id).toBe(near.id)
  })

  it('容差外返回 undefined', () => {
    expect(entryNearestDate([make('word', NOW + 9999)], NOW, 5000)).toBeUndefined()
  })

  it('平手时优先「word 且有 text」', () => {
    const sound = make('sound', NOW - 5000)
    const word = make('word', NOW + 5000, { text: '在' })
    expect(entryNearestDate([sound, word], NOW, 10_000)?.id).toBe(word.id)
  })
})

describe('把「无用」写进 schema', () => {
  it('聚合不往 Entry 上添字段，也不返回可排名的数', () => {
    const entries = [withTags('word', NOW, { themes: ['项目'] })]
    const before = JSON.stringify(entries)

    const forbidden = /count|total|streak/i
    for (const entry of entriesSince(entries, 0)) {
      expect(Object.keys(entry).filter((key) => forbidden.test(key))).toEqual([])
    }
    expect(JSON.stringify(entries)).toBe(before)

    const digest = memoryDigest(entries)
    expect(Object.keys(digest).sort()).toEqual(['emotions', 'recent', 'themes'])
  })
})

describe('memoryDigest', () => {
  it('按出现次数倒序，并给出最近几条 caption', () => {
    const entries = [
      withTags('word', NOW - 3 * DAY, { themes: ['项目'] }),
      withTags('word', NOW - 1 * DAY, { themes: ['项目'] }),
      withTags('word', NOW - 2 * DAY, { themes: ['休息'] }),
    ]
    const digest = memoryDigest(entries)
    expect(digest.themes).toEqual([
      { tag: '项目', n: 2 },
      { tag: '休息', n: 1 },
    ])
    expect(digest.recent).toHaveLength(3)
  })
})
