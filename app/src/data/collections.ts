import { MIN_ITEMS } from '@/data/discoveries'
import { db } from '@/features/memory/db'
import { createId } from '@/lib/id'

/**
 * 自建合集。用户自己挑几条记录，拢成一册。
 *
 * 与守望（watches.ts）是**同一种东西的另一半**，差别只在一处，且是有意的：
 *  - 守望存的是一个**词**，册是渲染时按词从记录里现算的——所以记录变多，册会长。
 *  - 合集存的是**选择本身**（一组 entryId），册是那几条记录——你挑了什么，就是什么。
 *
 * 守望那条「不存产出」的纪律在这里不适用：用户按下「我要这几条」的那一下，
 * 本身就是产出。存它，才不会下次刷新就散架。
 *
 * 名字去重、至少两条——这两条规矩与判据册一致（MIN_ITEMS 只有一处定义）。
 */

export interface Collection {
  id: string
  /** 册名，用户自己起的。 */
  name: string
  /** 被挑中的记录 id。顺序不参与渲染——卡片内容按 createdAt 排。 */
  entryIds: string[]
  createdAt: number
}

export async function listCollections(): Promise<Collection[]> {
  return db.collections.orderBy('createdAt').toArray()
}

/** 建一个合集。名字重复、或挑得不够两条，返回 null。 */
export async function addCollection(
  name: string,
  entryIds: readonly string[],
): Promise<Collection | null> {
  const trimmed = name.trim()
  const ids = [...new Set(entryIds)]
  if (!trimmed || ids.length < MIN_ITEMS) return null

  const all = await listCollections()
  if (all.some((c) => c.name === trimmed)) return null

  const collection: Collection = { id: createId('c'), name: trimmed, entryIds: ids, createdAt: Date.now() }
  await db.collections.put(collection)
  return collection
}

/** 删掉一个合集。记录一条不动——它只是不再拢在一起（与解散判据册同一句话）。 */
export async function removeCollection(id: string): Promise<void> {
  await db.collections.delete(id)
}
