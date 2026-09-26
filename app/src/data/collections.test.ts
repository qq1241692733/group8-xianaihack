import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/features/memory/db'

import { addCollection, listCollections, removeCollection } from './collections'

beforeEach(async () => {
  await db.collections.clear()
})

/**
 * 自建合集（docs/23）。
 *
 * 盯三件事，与守望的差别都在这里：
 *  1. 存的是**选择本身**（一组 entryId），不是判据——所以跨刷新还在；
 *  2. 名字去重、至少两条——与判据册同一条门槛；
 *  3. 删合集不碰记录——它只是不再拢在一起。
 */
describe('自建合集', () => {
  it('建一个，读回来还在', async () => {
    const made = await addCollection('门口那棵树', ['a', 'b'])
    expect(made?.name).toBe('门口那棵树')

    const all = await listCollections()
    expect(all.map((c) => c.name)).toEqual(['门口那棵树'])
    expect(all[0]?.entryIds).toEqual(['a', 'b'])
  })

  it('名字重复不建第二个', async () => {
    expect(await addCollection('山上', ['a', 'b'])).not.toBeNull()
    expect(await addCollection('山上', ['c', 'd'])).toBeNull()
    expect(await listCollections()).toHaveLength(1)
  })

  it('不够两条不建——一条不叫合集', async () => {
    expect(await addCollection('孤零零', ['a'])).toBeNull()
    expect(await addCollection('空', [])).toBeNull()
    expect(await listCollections()).toHaveLength(0)
  })

  it('空名字不建', async () => {
    expect(await addCollection('   ', ['a', 'b'])).toBeNull()
  })

  it('重复的 id 去重', async () => {
    const made = await addCollection('山上', ['a', 'a', 'b'])
    expect(made?.entryIds).toEqual(['a', 'b'])
  })

  it('删掉就没了，记录一条不动', async () => {
    const made = await addCollection('山上', ['a', 'b'])
    if (!made) throw new Error('应该建成')
    await removeCollection(made.id)
    expect(await listCollections()).toHaveLength(0)
  })
})
