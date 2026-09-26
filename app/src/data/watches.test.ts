import { describe, expect, it } from 'vitest'

import { watchCard, volumeOf } from './discoveries'
import { watchMatches, type Watch } from './watches'
import type { Entry, EntryKind } from '@/features/memory/types'

/**
 * 守望的对账（docs/23）。
 *
 * 守望不存产出——册是渲染时从记录里现算的。所以这里盯三件事：
 *  1. 匹配是诚实子串：词落在哪个字段都算命中，落在哪个都不多算；
 *  2. 守望册的形态服从卷的三条规则（封面 = 主导类型，平手照片优先）；
 *  3. 撤回守望 = 不再产出这一册（不存产出，所以没有清理这回事）。
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

const watch: Watch = { id: 'w1', word: '孩子', createdAt: 0 }

describe('守望匹配', () => {
  it('词落在 people / scene / text / themes / places 任一字段都命中', () => {
    expect(watchMatches(watch, entry({ tags: { scene: '', themes: [], emotions: [], people: ['孩子'], places: [], clues: [] } }))).toBe(true)
    expect(watchMatches(watch, entry({ tags: { scene: '孩子在客厅搭积木', themes: [], emotions: [], people: [], places: [], clues: [] } }))).toBe(true)
    expect(watchMatches(watch, entry({ text: '孩子今天第一次把鞋穿对了脚。' }))).toBe(true)
  })

  it('不相关的记录不命中', () => {
    expect(watchMatches(watch, entry({ text: '电梯停在 17 楼。' }))).toBe(false)
  })

  it('hints 是演示守望词的线索，界面不显示但匹配生效', () => {
    const w: Watch = { id: 'w2', word: '想不到的声音', createdAt: 0, hints: ['冰箱', '猫'] }
    expect(watchMatches(w, entry({ tags: { scene: '冰箱的低鸣', themes: [], emotions: [], people: [], places: [], clues: [] } }))).toBe(true)
    expect(watchMatches(w, entry({ tags: { scene: '楼道里的猫', themes: [], emotions: [], people: [], places: [], clues: [] } }))).toBe(true)
    expect(watchMatches(w, entry({ text: '外面在下雨。' }))).toBe(false)
  })
})

describe('守望册', () => {
  const items = [
    entry({ id: 'p1', kind: 'photo', createdAt: 300, tags: { scene: '孩子在客厅', themes: [], emotions: [], people: ['孩子'], places: [], clues: [] } }),
    entry({ id: 's1', kind: 'sound', createdAt: 200, tags: { scene: '孩子学猫叫', themes: [], emotions: [], people: ['孩子'], places: [], clues: [] } }),
    entry({ id: 'w1', kind: 'word', createdAt: 100, text: '孩子把鞋穿对了脚。', tags: { scene: '', themes: [], emotions: [], people: ['孩子'], places: [], clues: [] } }),
  ]

  it('凑够两条成册，册名是守望词，来源是 watch', () => {
    const card = watchCard(watch, items)
    expect(card).not.toBeNull()
    expect(card?.title).toBe('孩子')
    expect(card?.origin).toBe('watch')
    expect(card?.watchWord).toBe('孩子')
  })

  it('三类平手时封面材质是照片（照片 > 声音 > 文字）', () => {
    const card = watchCard(watch, items)!
    expect(volumeOf(card).lead).toBe('photo')
    expect(volumeOf(card).sections.map((s) => s.kind)).toEqual(['sound', 'photo', 'word'])
    expect(volumeOf(card).single).toBe(false)
  })

  it('凑不够两条不成册——守望不硬凑', () => {
    expect(watchCard(watch, items.slice(0, 1))).toBeNull()
  })

  it('撤回守望后不再产出这一册（没有清理这回事）', () => {
    expect(watchCard({ ...watch, id: 'gone' }, items)).not.toBeNull()
    // 撤回 = watches 里没有它 = buildDiscoveries 不会再调 watchCard——
    // 册自然消失，记录一条不少地散回时间页。
    expect(items).toHaveLength(3)
  })

  it('单类型册不显示段头（纯声音册只有一段）', () => {
    const sounds = [
      entry({ id: 's1', kind: 'sound', createdAt: 300, tags: { scene: '冰箱的低鸣', themes: [], emotions: [], people: [], places: [], clues: [] } }),
      entry({ id: 's2', kind: 'sound', createdAt: 200, tags: { scene: '楼道里的猫', themes: [], emotions: [], people: [], places: [], clues: [] } }),
    ]
    const card = watchCard({ id: 'w2', word: '想不到的声音', createdAt: 0, hints: ['冰箱', '猫'] }, sounds)!
    expect(volumeOf(card).single).toBe(true)
    expect(volumeOf(card).sections).toHaveLength(1)
    expect(volumeOf(card).lead).toBe('sound')
  })
})
