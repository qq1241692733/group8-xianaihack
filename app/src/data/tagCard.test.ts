import { describe, expect, it } from 'vitest'

import { clueCardFrom, tagCardFrom } from './discoveries'
import type { Entry, EntryTags } from '@/features/memory/types'

function tags(partial: Partial<EntryTags> = {}): EntryTags {
  return { scene: '', themes: [], emotions: [], people: [], places: [], clues: [], ...partial }
}

function entry(id: string, createdAt: number, t: EntryTags): Entry {
  return { id, kind: 'word', createdAt, tags: t, tagSource: 'rule' }
}

describe('tagCardFrom（按标签成册）', () => {
  it('用标签值当册名，复用 cardFromDef 的成卡规则', () => {
    const entries = [
      entry('a', 100, tags({ themes: ['独处'] })),
      entry('b', 200, tags({ themes: ['独处'] })),
      entry('c', 300, tags({ themes: ['工作'] })),
    ]
    const card = tagCardFrom('独处', 'themes', entries)
    expect(card).not.toBeNull()
    expect(card?.title).toBe('独处')
    expect(card?.origin).toBe('promoted')
    expect(card?.items.map((e) => e.id)).toEqual(['b', 'a']) // createdAt 倒序
    expect(card?.from).toBe(100)
    expect(card?.to).toBe(200)
  })

  it('不足两条不成册（一条不叫联系）', () => {
    const entries = [entry('a', 100, tags({ themes: ['独处'] }))]
    expect(tagCardFrom('独处', 'themes', entries)).toBeNull()
  })

  it('没有记录带这个标签就不成册', () => {
    const entries = [
      entry('a', 100, tags({ themes: ['工作'] })),
      entry('b', 200, tags({ themes: ['工作'] })),
    ]
    expect(tagCardFrom('独处', 'themes', entries)).toBeNull()
  })

  it('一个「此刻」是原子的：命中标签的那条把同组的其余一起带进册', () => {
    const photo: Entry = { ...entry('p', 200, tags({ themes: ['出游'] })), momentId: 'mo1' }
    const mood: Entry = { ...entry('m', 190, tags()), momentId: 'mo1', text: '累但风很舒服' }

    const card = tagCardFrom('出游', 'themes', [photo, mood])
    expect(card?.items.map((e) => e.id)).toEqual(['p', 'm'])
  })

  it('只有一条命中，但同组还有伴 → 够两条，成册', () => {
    const photo: Entry = { ...entry('p', 200, tags({ themes: ['出游'] })), momentId: 'mo1' }
    const mood: Entry = { ...entry('m', 190, tags()), momentId: 'mo1' }

    // 判据只命中 photo；若没有 momentId 就是一条，不成册。整个「此刻」救回了它。
    expect(tagCardFrom('出游', 'themes', [photo, mood])).not.toBeNull()
    expect(tagCardFrom('出游', 'themes', [photo])).toBeNull()
  })
})

describe('clueCardFrom（按自由线索成册）', () => {
  it('子串命中：说「缆车」，拢起标了这一线索的那些', () => {
    const entries = [
      entry('a', 100, tags({ clues: ['缆车', '台阶'] })),
      entry('b', 200, tags({ clues: ['缆车'] })),
    ]
    const card = clueCardFrom('缆车', entries)
    expect(card?.title).toBe('缆车')
    expect(card?.origin).toBe('promoted')
    expect(card?.items.map((e) => e.id)).toEqual(['b', 'a']) // createdAt 倒序
  })

  it('正文里的词也算数——匹配面与守望同源（entryMatches）', () => {
    const entries: Entry[] = [
      { ...entry('a', 100, tags()), text: '坐缆车上山' },
      entry('b', 200, tags({ clues: ['缆车'] })),
    ]
    expect(clueCardFrom('缆车', entries)?.items).toHaveLength(2)
  })

  it('不足两条不成册（一条不叫联系）', () => {
    expect(clueCardFrom('缆车', [entry('a', 100, tags({ clues: ['缆车'] }))])).toBeNull()
  })

  it('命中一条也把整个「此刻」带出来', () => {
    const photo: Entry = { ...entry('p', 200, tags({ clues: ['缆车'] })), momentId: 'mo1' }
    const mood: Entry = { ...entry('m', 190, tags()), momentId: 'mo1' }
    expect(clueCardFrom('缆车', [photo, mood])?.items.map((e) => e.id)).toEqual(['p', 'm'])
  })
})
