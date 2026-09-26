import Dexie, { type Table } from 'dexie'

import type { Collection } from '@/data/collections'
import type { Watch } from '@/data/watches'
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
  watches!: Table<Watch, string>
  collections!: Table<Collection, string>

  constructor(name = 'cike') {
    super(name)
    this.version(1).stores({
      entries: 'id, createdAt, kind, [kind+createdAt]',
      blobs: 'id',
      meta: 'key',
    })
    // v2：守望——agent 的第一个跨会话状态（见 docs/23）。
    // 存的是「你让它替你留意什么」，不存任何由守望推出来的结果：
    // 册是渲染时从记录里现算的（与发现判据同一套机制），删掉守望词不会留下一具尸体。
    this.version(2).stores({
      watches: 'id, createdAt',
    })
    // v3：自建合集。存的是**用户的选择本身**（一组 entryId），不是判据——
    // 与守望的差别是有意的：守望按词现算，合集只认你挑的那几条（见 data/collections.ts）。
    // entryIds 不建索引：与标签同一条纪律，几千条内存过滤足够。
    this.version(3).stores({
      collections: 'id, createdAt',
    })
  }
}

export const db = new CikeDB()
