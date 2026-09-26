import { describe, expect, it } from 'vitest'

import { volumeOf, type DiscoveryCard } from '@/data/discoveries'
import { routeVolumeIntent } from '@/features/agent/volumeIntent'
import type { Entry, EntryKind } from '@/features/memory/types'

/**
 * 对话返回册的路由对账（docs/23 §三）。
 *
 * 路由是本地确定性的——查询不走 LLM，整理命中示例册出草稿。
 * 这里盯的是那几条会被现场兑现的承诺：
 *  1. 动作由状态决定：同一册，整理→草稿（留下），守望→已有（翻开来）；
 *  2. 材质词过滤：「哪些声音」只回声音主导的册；
 *  3. 没命中就交还给 LLM 那一路（返回 null），不硬凑。
 */

function entry(id: string, kind: EntryKind, over: Partial<Entry> = {}): Entry {
  return {
    id,
    kind,
    createdAt: 0,
    tags: { scene: '', themes: [], emotions: [], people: [], places: [], clues: [] },
    tagSource: 'seed',
    ...over,
  }
}

const shepherd = {
  leadOf: (c: DiscoveryCard) => volumeOf(c).lead,
  keptIds: [] as string[],
}

const mk = (id: string, title: string, origin: DiscoveryCard['origin'], items: Entry[]): DiscoveryCard => ({
  id,
  axis: 'theme',
  title,
  note: '……',
  thumb: 'scene',
  items,
  from: 0,
  to: 0,
  origin,
})

const soundLed = mk('v-sound', '想不到的声音', 'watch', [
  entry('s1', 'sound', { tags: { scene: '缆车的低鸣', themes: [], emotions: [], people: [], places: ['山上'], clues: [] } }),
  entry('s2', 'sound', { tags: { scene: '栈道尽头的风', themes: [], emotions: [], people: [], places: ['山上'], clues: [] } }),
])
const photoLed = mk('v-photo', '上山', 'judge', [
  entry('p1', 'photo', { tags: { scene: '雾把玛尼堆罩住了', themes: ['出游'], emotions: [], people: [], places: ['山上'], clues: [] } }),
  entry('p2', 'photo', { tags: { scene: '雾里的栈道', themes: ['出游'], emotions: [], people: [], places: ['山上'], clues: [] } }),
])
const volumes = [soundLed, photoLed]

describe('对话返回册 · 本地路由', () => {
  it('查询按材质词过滤：问「哪些声音」只回声音主导的册', () => {
    const r = routeVolumeIntent('我留意过哪些声音？', volumes, shepherd)
    expect(r?.kind).toBe('query')
    expect(r?.cards.map((c) => c.id)).toEqual(['v-sound'])
  })

  it('查询点名册名：只回被点名的那一册', () => {
    const r = routeVolumeIntent('找一下上山那册', volumes, shepherd)
    expect(r?.cards.map((c) => c.id)).toEqual(['v-photo'])
  })

  it('整理示例册 → 草稿回执（动作是留下，不是翻开来）', () => {
    const r = routeVolumeIntent('把上山整理一下', volumes, shepherd)
    expect(r?.kind).toBe('organize')
    expect(r?.draft).toBe(true)
    expect(r?.cards[0].id).toBe('v-photo')
  })

  it('整理守望册 → 已有回执（它在架上，动作只能是翻开来）', () => {
    const r = routeVolumeIntent('把想不到的声音整理一下', volumes, shepherd)
    expect(r?.kind).toBe('organize')
    expect(r?.draft).toBe(false)
  })

  it('已保留的册再整理一次，也是已有，不会出第二张草稿', () => {
    const r = routeVolumeIntent('把上山整理一下', volumes, { ...shepherd, keptIds: ['v-photo'] })
    expect(r?.draft).toBe(false)
  })

  it('无关的话不路由——交给自由输入那一路', () => {
    expect(routeVolumeIntent('今天有点累。', volumes, shepherd)).toBeNull()
    expect(routeVolumeIntent('把不存在的册整理一下', volumes, shepherd)).toBeNull()
    expect(routeVolumeIntent('我留意过哪些云？', volumes, shepherd)).toBeNull()
  })

  it('单字册名（标签值如「家」）也能被点名命中', () => {
    const home = mk('tag-places-家', '家', 'promoted', [
      entry('h1', 'photo', { tags: { scene: '', themes: [], emotions: [], people: [], places: ['家'], clues: [] } }),
      entry('h2', 'word', { tags: { scene: '', themes: [], emotions: [], people: [], places: ['家'], clues: [] } }),
    ])
    const r = routeVolumeIntent('我留意过哪些在家的时刻', [...volumes, home], shepherd)
    expect(r?.cards.map((c) => c.id)).toEqual(['tag-places-家'])
  })
})
