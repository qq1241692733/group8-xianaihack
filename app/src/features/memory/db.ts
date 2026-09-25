import Dexie, { type Table } from 'dexie'

import type { Entry } from './types'

export interface BlobRecord {
  id: string
  blob: Blob
  mimeType: string
}

export interface MetaRecord {
  key: string
  value: unknown
}

/**
 * 本地库。隐私原则的第一条：能本地完成的分析优先本地完成。
 *
 * 索引策略（对应方案第三节"不做向量 RAG"）：
 *   只索引 id / createdAt / kind / [kind+createdAt]。
 *   标签维度（themes / emotions / people / places）**刻意不建索引**——个人几千条封顶，
 *   内存过滤是微秒级；而为嵌套数组建 multiEntry 索引会让写入路径变复杂，
 *   还容易在标签更新时留下不一致的索引。复杂度花在"写入时提取标签"上更值。
 *
 * 表结构里没有 focusSessions、没有 stats、没有 streaks。
 * 3 分钟专注不落库，所以它连一张表都没资格拥有。
 */
export class CikeDB extends Dexie {
  entries!: Table<Entry, string>
  blobs!: Table<BlobRecord, string>
  meta!: Table<MetaRecord, string>

  constructor(name = 'cike') {
    super(name)
    this.version(1).stores({
      entries: 'id, createdAt, kind, [kind+createdAt]',
      blobs: 'id',
      meta: 'key',
    })
  }
}

export const db = new CikeDB()
