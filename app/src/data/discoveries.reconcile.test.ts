import { beforeEach, describe, expect, it } from 'vitest'

import { clearEntries, listEntries } from '@/features/memory/repo'

import { buildDiscoveries, MIN_ITEMS } from './discoveries'
import { seedIfEmpty } from './seed'

/**
 * 发现卡的对账回归。
 *
 * 卡片上那行「2026.09.10 — 09.26」不是文案，是从记录里数出来的。
 * 谁动了种子，让某张卡引用到不存在的记录、或让跨度对不上真实起止，这里先红——
 * 而不是等演示现场点开一张卡，被告知「内容不存在」。
 */
describe('发现卡与真实记录的对账', () => {
  beforeEach(async () => {
    await clearEntries()
  })

  it('每张卡引用的记录都真实存在，且跨度等于所引用记录的真实起止', async () => {
    await seedIfEmpty()
    const entries = await listEntries()
    const ids = new Set(entries.map((e) => e.id))

    const cards = buildDiscoveries(entries)
    expect(cards.length).toBeGreaterThan(0)

    for (const card of cards) {
      expect(card.items.length).toBeGreaterThanOrEqual(MIN_ITEMS)
      for (const item of card.items) expect(ids.has(item.id)).toBe(true)
      expect(card.from).toBe(Math.min(...card.items.map((i) => i.createdAt)))
      expect(card.to).toBe(Math.max(...card.items.map((i) => i.createdAt)))
    }
  })

  it('两种轴各至少成一张卡', async () => {
    await seedIfEmpty()
    const cards = buildDiscoveries(await listEntries())
    expect(cards.some((c) => c.axis === 'theme')).toBe(true)
    expect(cards.some((c) => c.axis === 'time')).toBe(true)
  })

  it('时间型卡里的每一条都真的落在深夜', async () => {
    await seedIfEmpty()
    const late = buildDiscoveries(await listEntries()).find((c) => c.id === 'd-late')
    expect(late).toBeDefined()

    for (const item of late?.items ?? []) {
      const h = new Date(item.createdAt).getHours()
      expect(h >= 23 || h < 4).toBe(true)
    }
  })

  it('新的记录放在最上边：按册内最近一条的时间倒序', async () => {
    await seedIfEmpty()
    const cards = buildDiscoveries(await listEntries())
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i - 1]?.to).toBeGreaterThanOrEqual(cards[i]?.to ?? 0)
    }
  })

  it('跨度最长的那一册是「门口那棵树」，而且它排在首位', async () => {
    await seedIfEmpty()
    const tree = buildDiscoveries(await listEntries()).find((c) => c.id === 'd-tree')
    expect(tree).toBeDefined()
    if (!tree) return

    // 跨度是真的：去年十月 → 今天
    const days = (tree.to - tree.from) / 86_400_000
    expect(days).toBeGreaterThan(300)
    // 它里面最近一条就是种子最新的那条，所以整体排在最上
    const first = buildDiscoveries(await listEntries())[0]
    expect(first?.id).toBe('d-tree')
  })

  it('一个线索跨类型：那一册里文字 / 声音 / 照片都在', async () => {
    await seedIfEmpty()
    const tree = buildDiscoveries(await listEntries()).find((c) => c.id === 'd-tree')
    const kinds = new Set(tree?.items.map((item) => item.kind))
    expect([...kinds].sort()).toEqual(['photo', 'sound', 'word'])
  })
})
