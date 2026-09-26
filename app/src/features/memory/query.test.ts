import { describe, expect, it } from 'vitest'

import type { Entry, EntryTags } from './types'

import { collectClueCandidates, collectTagCandidates, entryMatches, expandToMoments, filterByScene, filterByTag } from './query'

function tags(partial: Partial<EntryTags> = {}): EntryTags {
  return { scene: '', themes: [], emotions: [], people: [], places: [], clues: [], ...partial }
}

function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return { id, kind: 'word', createdAt: 1, tags: tags(), tagSource: 'rule', ...overrides }
}

const A = entry('a', { tags: tags({ themes: ['独处'], places: ['家'] }), text: '一个人在客厅' })
const B = entry('b', { tags: tags({ themes: ['独处', '工作'] }), text: '加班' })
const C = entry('c', { tags: tags({ scene: '窗外的光', people: ['孩子'] }) })

describe('filterByTag', () => {
  it('精确命中标签值', () => {
    expect(filterByTag([A, B, C], 'themes', '独处').map((e) => e.id)).toEqual(['a', 'b'])
    expect(filterByTag([A, B, C], 'themes', '工作').map((e) => e.id)).toEqual(['b'])
  })

  it('没人带的标签返回空，不抛错', () => {
    expect(filterByTag([A, B, C], 'places', '公司')).toEqual([])
  })
})

describe('filterByScene', () => {
  it('按场景描述子串命中', () => {
    expect(filterByScene([A, B, C], '窗外').map((e) => e.id)).toEqual(['c'])
  })
})

describe('entryMatches', () => {
  it('命中正文、标签或场景任一即可', () => {
    expect(entryMatches(A, ['客厅'])).toBe(true) // 正文
    expect(entryMatches(A, ['独处'])).toBe(true) // 标签
    expect(entryMatches(C, ['窗外'])).toBe(true) // 场景
  })

  it('自由线索也算命中面——它记得的是具体的物', () => {
    const cup = entry('cup', { tags: tags({ clues: ['马克杯', '茶渍'] }) })
    expect(entryMatches(cup, ['马克杯'])).toBe(true)
    expect(entryMatches(cup, ['茶渍'])).toBe(true)
    // 子串够不着「杯子→马克杯」那种语义跳跃，那一步交给模型，不在这里硬凑
    expect(entryMatches(cup, ['杯子'])).toBe(false)
  })

  it('全都不沾返回 false', () => {
    expect(entryMatches(A, ['不存在'])).toBe(false)
  })
})

describe('collectClueCandidates', () => {
  it('跨条目收集自由线索并去重', () => {
    const a = entry('a', { tags: tags({ clues: ['缆车', '台阶'] }) })
    const b = entry('b', { tags: tags({ clues: ['台阶', '栈道'] }) })

    expect(collectClueCandidates([a, b])).toEqual(['缆车', '台阶', '栈道'])
  })

  it('没有线索就是空，不抛错', () => {
    expect(collectClueCandidates([A, B, C])).toEqual([])
  })
})

describe('collectTagCandidates', () => {
  it('跨维度收集全部标签值并去重', () => {
    const out = collectTagCandidates([A, B, C])
    const labels = out.map((c) => c.label)
    expect(labels).toContain('独处')
    expect(labels).toContain('工作')
    expect(labels).toContain('家')
    expect(labels).toContain('孩子')
    // 「独处」在 A、B 里都有，只应出现一次
    expect(labels.filter((l) => l === '独处')).toHaveLength(1)
  })
})

describe('expandToMoments', () => {
  // 一次爬山：照片带「出游」，同组的一句话没带 —— 命中照片该把那句话一起带出来。
  const photo = entry('p', { createdAt: 3, momentId: 'mo1', tags: tags({ themes: ['出游'] }) })
  const mood = entry('m', { createdAt: 2, momentId: 'mo1', text: '累但风很舒服' })
  const lone = entry('l', { createdAt: 1, tags: tags({ themes: ['出游'] }) })
  const all = [photo, mood, lone]

  it('命中一条，把同组的其余一起带出来', () => {
    expect(expandToMoments(all, [photo]).map((e) => e.id)).toEqual(['p', 'm'])
  })

  it('没有 momentId 的命中原样返回', () => {
    expect(expandToMoments(all, [lone]).map((e) => e.id)).toEqual(['l'])
  })

  it('多个命中同组时不重复', () => {
    expect(expandToMoments(all, [photo, mood]).map((e) => e.id)).toEqual(['p', 'm'])
  })

  it('结果按时间倒序', () => {
    const ids = expandToMoments(all, [photo, lone]).map((e) => e.id)
    expect(ids).toEqual(['p', 'm', 'l'])
  })

  it('空命中进，空结果出，不抛错', () => {
    expect(expandToMoments(all, [])).toEqual([])
  })

  it('展开会把不匹配判据的同组元素也拉进来——一个「此刻」不该被劈开', () => {
    // mood 自己不带「出游」，但它是 photo 那件事的一部分。
    const hit = all.filter((e) => e.tags.themes.includes('出游'))
    expect(hit.map((e) => e.id)).toEqual(['p', 'l'])
    expect(expandToMoments(all, hit).map((e) => e.id)).toEqual(['p', 'm', 'l'])
  })
})
