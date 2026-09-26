import { describe, expect, it } from 'vitest'

import type { Entry, EntryKind } from '@/features/memory/types'

import type { Collection } from './collections'
import { buildDiscoveries, collectionCardFrom } from './discoveries'

/**
 * 自建合集成册（docs/23）。
 *
 * 与守望/判据共用 cardFromDef，所以这里盯的是它**自己的**两处：
 *  1. 判据是「id 在挑中的那组里」，不是词命中；
 *  2. 排布在守望之后、判据之前（时间打平时，稳定排序保住这个先后）。
 */

function entry(partial: Partial<Entry>): Entry {
  return {
    id: partial.id ?? 'e',
    kind: (partial.kind ?? 'word') as EntryKind,
    createdAt: partial.createdAt ?? 0,
    tags: partial.tags ?? { scene: '', themes: [], emotions: [], people: [], places: [], clues: [] },
    tagSource: 'seed',
    ...partial,
  }
}

const items = [
  entry({ id: 'p1', kind: 'photo', createdAt: 300 }),
  entry({ id: 'w1', kind: 'word', createdAt: 200, text: '就是它。' }),
  entry({ id: 'x1', kind: 'word', createdAt: 100, text: '无关的一条。' }),
]

const collection: Collection = { id: 'c1', name: '我自己拢的', entryIds: ['p1', 'w1'], createdAt: 0 }

describe('自建合集成册', () => {
  it('按挑中的 id 成册，册名是用户起的名字，来源是 custom', () => {
    const card = collectionCardFrom(collection, items)
    expect(card).not.toBeNull()
    expect(card?.title).toBe('我自己拢的')
    expect(card?.origin).toBe('custom')
    expect(card?.collectionId).toBe('c1')
    expect(card?.items.map((e) => e.id).sort()).toEqual(['p1', 'w1'])
  })

  it('没挑中的那条不在册里', () => {
    const card = collectionCardFrom(collection, items)!
    expect(card.items.map((e) => e.id)).not.toContain('x1')
  })

  it('只挑到一条不成册——与判据册同一条门槛', () => {
    expect(collectionCardFrom({ ...collection, entryIds: ['p1'] }, items)).toBeNull()
  })

  it('挑中的记录已经不在库存里时不成册（不留空壳）', () => {
    expect(collectionCardFrom({ ...collection, entryIds: ['gone', 'also-gone'] }, items)).toBeNull()
  })

  it('时间打平时，自建合集排在守望之后、判据之前', () => {
    // 三条记录同一个时间：①被守望词命中 ②被挑进合集 ③命中判据 d-alone（独处）。
    const same: Entry[] = [
      entry({ id: 'a', createdAt: 100, text: '孩子一个人待着', tags: { scene: '', themes: ['独处'], emotions: [], people: ['孩子'], places: [], clues: [] } }),
      entry({ id: 'b', createdAt: 100, text: '又一次，一个人的时候', tags: { scene: '', themes: ['独处'], emotions: [], people: ['孩子'], places: [], clues: [] } }),
    ]
    const cards = buildDiscoveries(
      same,
      [{ id: 'w1', word: '孩子', createdAt: 0 }],
      [{ id: 'c1', name: '自留地', entryIds: ['a', 'b'], createdAt: 0 }],
    )
    expect(cards.map((c) => c.origin)).toEqual(['watch', 'custom', 'judge'])
  })
})
