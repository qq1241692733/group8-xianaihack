import { describe, expect, it } from 'vitest'

import { buildTimeline } from './timeline'
import type { Entry, EntryTags } from './types'

function tags(): EntryTags {
  return { scene: '', themes: [], emotions: [], people: [], places: [], clues: [] }
}

function entry(id: string, createdAt: number, over: Partial<Entry> = {}): Entry {
  return { id, kind: 'word', createdAt, tags: tags(), tagSource: 'seed', ...over }
}

/** 2026-09-10 的某个整点，避开「今天/昨天」这些会随时钟变的标签。 */
const T = (hour: number, day = 10): number => new Date(2026, 8, day, hour, 0, 0).getTime()

describe('buildTimeline', () => {
  it('一条就是一条，按时间倒序', () => {
    const days = buildTimeline([entry('a', T(9)), entry('b', T(11))], 'all')
    expect(days).toHaveLength(1)
    expect(days[0]?.nodes.map((node) => node.key)).toEqual(['b', 'a'])
    expect(days[0]?.nodes[0]?.momentId).toBeUndefined()
  })

  it('同一次落下的几条收成一个节点', () => {
    const days = buildTimeline(
      [
        entry('a', T(9), { momentId: 'mo1' }),
        entry('b', T(9), { momentId: 'mo1', kind: 'photo' }),
        entry('c', T(8)),
      ],
      'all',
    )
    const nodes = days[0]?.nodes ?? []
    expect(nodes).toHaveLength(2)
    expect(nodes[0]?.key).toBe('mo1')
    expect(nodes[0]?.entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(nodes[0]?.at).toBe(T(9))
    expect(nodes[1]?.key).toBe('c')
  })

  it('节点内按时间倒序，at 取最新那条', () => {
    const days = buildTimeline(
      [
        entry('old', T(7), { momentId: 'mo1' }),
        entry('new', T(12), { momentId: 'mo1' }),
      ],
      'all',
    )
    const node = days[0]?.nodes[0]
    expect(node?.entries.map((e) => e.id)).toEqual(['new', 'old'])
    expect(node?.at).toBe(T(12))
  })

  it('一个「此刻」落在它最后发生的那一天，不劈成两天', () => {
    const photo = entry('p', new Date(2026, 5, 1, 10).getTime(), {
      momentId: 'mo1',
      kind: 'photo',
    })
    const word = entry('w', new Date(2026, 8, 10, 20).getTime(), { momentId: 'mo1' })
    const days = buildTimeline([photo, word], 'all')
    expect(days).toHaveLength(1)
    expect(days[0]?.nodes).toHaveLength(1)
    expect(days[0]?.nodes[0]?.entries.map((e) => e.id)).toEqual(['w', 'p'])
  })

  it('筛选后只留下还看得见的那几条，仍是一个节点', () => {
    const days = buildTimeline(
      [
        entry('w1', T(9), { momentId: 'mo1' }),
        entry('p1', T(9), { momentId: 'mo1', kind: 'photo' }),
      ],
      'photo',
    )
    expect(days[0]?.nodes).toHaveLength(1)
    expect(days[0]?.nodes[0]?.momentId).toBe('mo1')
    expect(days[0]?.nodes[0]?.entries.map((e) => e.id)).toEqual(['p1'])
  })

  it('不同天分成不同的天', () => {
    const days = buildTimeline([entry('a', T(9, 10)), entry('b', T(9, 12))], 'all')
    expect(days).toHaveLength(2)
    expect(days[0]?.nodes[0]?.key).toBe('b')
    expect(days[1]?.nodes[0]?.key).toBe('a')
  })

  it('空进空出', () => {
    expect(buildTimeline([], 'all')).toEqual([])
    expect(buildTimeline([entry('a', T(9))], 'photo')).toEqual([])
  })
})
