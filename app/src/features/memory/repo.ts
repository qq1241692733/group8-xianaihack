import Dexie from 'dexie'

import { createId } from '@/lib/id'

import { db } from './db'
import { deriveLocalTags } from './extract'
import type { Entry, EntryDraft, EntryKind, EntryMeta, EntryTags, TagSource } from './types'

/**
 * 写入一条「此刻」。
 *
 * 这里刻意不做的事：
 *  - 不累加任何计数（不存在「今天已记录 N 条」这种可累加的东西）
 *  - 不标记完成、不返回成就、不因为写入而改动别的条目
 */
export async function addEntry(draft: EntryDraft): Promise<Entry> {
  const entry = buildEntry(draft, createId())
  await writeEntry(entry, draft)
  return entry
}

/**
 * 一次落下好几条，它们共享一个 momentId —— 这就是「记下此刻」。
 *
 * 拍张照、再写句心情，是一个事务，不是一个照片加一句话：整组在**一个** Dexie 事务里写，
 * 中途失败一起回滚，不会留下半个「此刻」。
 *
 * createdAt 仍**逐条按各自规则**（EXIF 拍摄时间优先）。身份由 momentId 承载，不由时间承载——
 * 一张当天早些时候拍的照片，可以合理地并进此刻正在发生的这件事。
 */
export async function addMoment(drafts: readonly EntryDraft[]): Promise<Entry[]> {
  const momentId = createId('mo')
  const entries = drafts.map((draft) => buildEntry(draft, createId(), momentId))
  await db.transaction('rw', db.entries, db.blobs, async () => {
    for (let i = 0; i < entries.length; i++) {
      await writeEntry(entries[i]!, drafts[i]!)
    }
  })
  return entries
}

/** 纯构造：draft → Entry。不碰数据库，好测，也让 addEntry 与 addMoment 共用同一份规则。 */
function buildEntry(draft: EntryDraft, id: string, momentId?: string): Entry {
  const entry: Entry = {
    id,
    kind: draft.kind,
    // 相册来的照片带 EXIF 拍摄时间：它回到真正发生的时刻，而不是上传的此刻。
    createdAt: draft.exif?.takenAt ?? draft.createdAt ?? Date.now(),
    tags: deriveLocalTags(draft),
    // 规则提取，不是 LLM。如实标成 'rule' 而不是 'llm'——
    // 检索层要能分辨「这条标签是谁标的」，此刻撒的谎以后就追不回来了。
    tagSource: 'rule',
  }

  if (draft.text !== undefined) entry.text = draft.text
  if (draft.durationMs !== undefined) entry.durationMs = draft.durationMs
  if (momentId !== undefined) entry.momentId = momentId

  const meta: EntryMeta = {}
  if (draft.exif) meta.exif = draft.exif
  if (draft.visual) meta.visual = draft.visual
  if (draft.imageHash) meta.hash = draft.imageHash
  if (draft.audio) meta.audio = draft.audio
  if (draft.source) meta.source = draft.source
  if (Object.keys(meta).length > 0) entry.meta = meta

  return entry
}

/** 把一条 Entry 连同它的 blob 写进库。blob 先进 blobs 表，回填 blobRef，再落 entries。 */
async function writeEntry(entry: Entry, draft: EntryDraft): Promise<void> {
  if (draft.blob) {
    const blobRef = `${entry.id}:blob`
    await db.blobs.put({
      id: blobRef,
      blob: draft.blob,
      mimeType: draft.blobMimeType ?? draft.blob.type,
    })
    entry.blobRef = blobRef
  }
  await db.entries.put(entry)
}

/**
 * 回写一条记录的标签（LLM 增强层用）。
 *
 * 增强失败时调用方根本不调这里——本地标签已在 addEntry 时落库，不会倒退。
 * tagSource 跟着更新，如实记录「这条标签被 LLM 加工过」。
 */
export async function updateEntryTags(
  id: string,
  tags: EntryTags,
  tagSource: TagSource,
): Promise<Entry | undefined> {
  const entry = await db.entries.get(id)
  if (!entry) return undefined
  const next: Entry = { ...entry, tags, tagSource }
  await db.entries.put(next)
  return next
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
