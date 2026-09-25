import Dexie from 'dexie'

import { createId } from '@/lib/id'

import { db } from './db'
import { extractTags } from './extract'
import type { Entry, EntryDraft, EntryKind } from './types'

/**
 * 写入一条「此刻」。
 *
 * 这里刻意不做的事：
 *  - 不累加任何计数（不存在「今天已记录 N 条」这种可累加的东西）
 *  - 不标记完成、不返回成就、不因为写入而改动别的条目
 */
export async function addEntry(draft: EntryDraft): Promise<Entry> {
  const id = createId()

  const entry: Entry = {
    id,
    kind: draft.kind,
    createdAt: draft.createdAt ?? Date.now(),
    tags: extractTags(draft),
    // 规则提取，不是 LLM。如实标成 'rule' 而不是 'llm'——
    // 检索层要能分辨「这条标签是谁标的」，此刻撒的谎以后就追不回来了。
    tagSource: 'rule',
  }

  if (draft.text !== undefined) entry.text = draft.text
  if (draft.durationMs !== undefined) entry.durationMs = draft.durationMs

  if (draft.blob) {
    const blobRef = `${id}:blob`
    await db.blobs.put({
      id: blobRef,
      blob: draft.blob,
      mimeType: draft.blobMimeType ?? draft.blob.type,
    })
    entry.blobRef = blobRef
  }

  await db.entries.put(entry)
  return entry
}

/** 时间流：只按 createdAt 倒序。Entry 上没有第二个可排的键。 */
export async function listEntries(): Promise<Entry[]> {
  return db.entries.orderBy('createdAt').reverse().toArray()
}

/** 走 [kind+createdAt] 复合索引，不必把同类型条目全捞进内存再排。 */
export async function listByKind(kind: EntryKind): Promise<Entry[]> {
  return db.entries
    .where('[kind+createdAt]')
    .between([kind, Dexie.minKey], [kind, Dexie.maxKey])
    .reverse()
    .toArray()
}

export async function getBlob(blobRef: string): Promise<Blob | undefined> {
  const record = await db.blobs.get(blobRef)
  return record?.blob
}

export async function countEntries(): Promise<number> {
  return db.entries.count()
}

/** 只清 entries 与 blobs；meta 留着，否则每次启动都会重新灌种子。 */
export async function clearEntries(): Promise<void> {
  await db.transaction('rw', db.entries, db.blobs, async () => {
    await db.entries.clear()
    await db.blobs.clear()
  })
}
