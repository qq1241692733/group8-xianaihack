import { db } from '@/features/memory/db'
import type { Entry, EntryKind, EntryTags } from '@/features/memory/types'
import { createId } from '@/lib/id'

/**
 * 演示种子。正式包把 enabled 改成 false。
 *
 * 只在 entries 为空时灌一次，所以删库重来随时可以。
 *
 * 存在的理由：让「提到这个项目 7 次」「过去 7 天有 4 次在开始前停下来」「8 月 17 日」
 * 三处在演示里一定触发，不用现场攒历史。
 *
 * 注意这些数字不再是台词里的字面量，而是**真的从这里数出来的**：
 * 第 7–13 行都带 theme `项目`，加起来正好 7 次；其中落在 7 天窗口内、且带
 * emotion `逃避` 的是第 3、5、7、9 行，正好 4 次。改动任何一行的标签或时间，
 * 都会让台词里的数字跟着变——seed.reconcile.test.ts 盯着这个对账。
 */
export const seed = { enabled: true }

const MIN = 60_000

type SeedRow = {
  kind: EntryKind
  text?: string
  durationMs?: number
  /** 相对现在往前推多少分钟 */
  minutesAgo?: number
  /** 固定日期 [年, 月, 日, 时, 分]，给「8 月 17 日」那条用 */
  atDate?: [number, number, number, number, number]
  tags: EntryTags
}

function tags(
  scene: string,
  themes: string[] = [],
  emotions: string[] = [],
  people: string[] = [],
  places: string[] = [],
): EntryTags {
  return { scene, themes, emotions, people, places }
}

const ROWS: SeedRow[] = [
  {
    kind: 'sound',
    // 原单文件版这里是「地铁里有人在下雨。」——语义不通，已修正
    text: '外面在下雨。',
    durationMs: 22_000,
    minutesAgo: 11,
    tags: tags('窗外的雨', ['休息'], ['平静'], [], ['家']),
  },
  {
    kind: 'photo',
    minutesAgo: 95,
    tags: tags('窗外的光', ['休息'], ['平静'], [], ['家']),
  },
  {
    kind: 'word',
    text: '今天突然不想工作。',
    minutesAgo: 339,
    tags: tags('', ['工作'], ['逃避', '疲惫']),
  },
  {
    kind: 'sound',
    text: '咖啡厅的声音。',
    durationMs: 17_000,
    minutesAgo: 496,
    tags: tags('咖啡厅环境声', ['工作'], ['轻松'], [], ['咖啡厅']),
  },
  {
    kind: 'word',
    text: '我又在逃避了。',
    minutesAgo: 628,
    tags: tags('', ['自我'], ['逃避', '自责']),
  },
  {
    kind: 'word',
    text: '今天做得很少，但我不太想怪自己。',
    atDate: [2026, 8, 17, 21, 40],
    tags: tags('夜晚的房间', ['自我'], ['自责', '平静'], [], ['家']),
  },

  // ── 以下 7 行让「提到这个项目 7 次」成为真实计数 ───────────────────────
  // 跨度约 9 天，都带 theme `项目`。第 13 行故意落在 7 天窗口之外：
  // 所以「一共 7 次」与「7 天里 4 次」两个数能同时成立。
  {
    kind: 'word',
    text: '又在想那个项目。',
    minutesAgo: 60,
    tags: tags('', ['项目', '工作'], ['逃避', '疲惫']),
  },
  {
    kind: 'sound',
    minutesAgo: 1440,
    tags: tags('夜晚的房间', ['项目'], ['平静'], [], ['家']),
  },
  {
    kind: 'word',
    text: '方案还是没动。',
    minutesAgo: 2880,
    tags: tags('', ['项目', '自我'], ['逃避', '自责']),
  },
  {
    kind: 'word',
    text: '打开文档，又关上了。',
    minutesAgo: 4320,
    tags: tags('', ['项目'], ['疲惫']),
  },
  {
    kind: 'sound',
    minutesAgo: 7200,
    tags: tags('咖啡厅环境声', ['项目'], ['轻松'], [], ['咖啡厅']),
  },
  {
    kind: 'word',
    text: '想起这个项目还是会心虚。',
    minutesAgo: 9600,
    tags: tags('', ['项目', '自我'], ['自责']),
  },
  {
    kind: 'word',
    text: '拖了很久了。',
    minutesAgo: 12960,
    tags: tags('', ['项目'], ['疲惫']),
  },
]

function resolveCreatedAt(row: SeedRow, now: number): number {
  if (row.atDate) {
    const [y, m, d, h, min] = row.atDate
    return new Date(y, m - 1, d, h, min, 0, 0).getTime()
  }
  return now - (row.minutesAgo ?? 0) * MIN
}

export async function seedIfEmpty(): Promise<void> {
  if (!seed.enabled) return

  // 判断与写入必须在同一个事务里。
  //
  // StrictMode 下 hydrate 会跑两次，于是有两个并发的 seedIfEmpty。若 count() 在事务外，
  // 两个调用会同时看到空库、各灌一遍——浏览器里实测就是 26 条而不是 13 条，于是
  // 「过去 7 天有 8 次」这种翻倍的数字被说了出来。IndexedDB 对同一批 store 的读写事务
  // 是串行的，所以放进事务之后，第二个调用一定看得到第一个写下的行。
  await db.transaction('rw', db.entries, async () => {
    if ((await db.entries.count()) > 0) return

    const now = Date.now()

    await db.entries.bulkPut(
      ROWS.map((row) => {
        const entry: Entry = {
          id: createId('seed'),
          kind: row.kind,
          createdAt: resolveCreatedAt(row, now),
          tags: row.tags,
          tagSource: 'seed',
        }
        if (row.text !== undefined) entry.text = row.text
        if (row.durationMs !== undefined) entry.durationMs = row.durationMs
        return entry
      }),
    )
  })
}
