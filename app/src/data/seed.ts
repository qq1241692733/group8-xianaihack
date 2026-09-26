import { db } from '@/features/memory/db'
import type { Entry, EntryKind, EntryTags } from '@/features/memory/types'
import { createId } from '@/lib/id'

/**
 * 演示种子。正式包把 enabled 改成 false。
 *
 * 只在 entries 为空时灌一次，所以删库重来随时可以。
 *
 * ── 内容按「不要写情绪标签，写生活证据」整批重写（见 docs/05）──────────────
 * 旧版是「今天突然不想工作 / 我又在逃避了 / 又在想那个项目」——那是产品经理为了
 * 证明功能写出来的场景，指向单一（不想工作 → 理解 → 重新开始）。现在换成能指向
 * 生活本身的证据：电梯停在 17 楼、改标题字号、一个人吃饭。标签体系也跟着换：
 * theme `项目` → `独处`，emotion `逃避` → `停顿`。
 *
 * 数字仍然是**真的从这里数出来的**，不是台词里的字面量：
 * 第 7–13 行都带 theme `独处`，加起来正好 7 次；其中落在 7 天窗口内、且带
 * emotion `停顿` 的是第 3、5、7、9 行，正好 4 次。改动任何一行的标签或时间，
 * 都会让台词里的数字跟着变——seed.reconcile.test.ts 盯着这个对账。
 * ────────────────────────────────────────────────────────────
 */
export const seed = { enabled: true }

const MIN = 60_000

type SeedRow = {
  kind: EntryKind
  text?: string
  durationMs?: number
  /** 照片种子的文件（public/ 下）。有它就 fetch 成真 blob 写进 blobs 表——
   * 封面的照片条、卷内的照片格优先用真图，降级渐变只是没有图时的底。 */
  photoUrl?: string
  /** 相对现在往前推多少分钟 */
  minutesAgo?: number
  /** 固定日期 [年, 月, 日, 时, 分]，给「8 月 17 日」那条用 */
  atDate?: [number, number, number, number, number]
  /** 相对今天往前推几天、落在当天的几点几分 [时, 分, 几天前]，给「发现」的时间型卡片用 */
  atClock?: [number, number, number]
  tags: EntryTags
}

function tags(
  scene: string,
  themes: string[] = [],
  emotions: string[] = [],
  people: string[] = [],
  places: string[] = [],
  clues: string[] = [],
): EntryTags {
  return { scene, themes, emotions, people, places, clues }
}

const ROWS: SeedRow[] = [
  {
    kind: 'sound',
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
    text: '电梯停在 17 楼，我在门口站了两分钟才进去。',
    minutesAgo: 339,
    tags: tags('楼下的门口', ['自我'], ['停顿'], [], ['外面']),
  },
  {
    kind: 'sound',
    text: '咖啡厅的声音。',
    durationMs: 17_000,
    minutesAgo: 496,
    tags: tags('咖啡厅环境声', ['休息'], ['轻松'], [], ['咖啡厅']),
  },
  {
    kind: 'word',
    text: 'PPT 打开了四十分钟，我一直在改第一页标题的字号。',
    minutesAgo: 628,
    tags: tags('', ['工作'], ['停顿']),
  },
  {
    kind: 'word',
    text: '今天做得很少，但我不太想怪自己。',
    atDate: [2026, 8, 17, 21, 40],
    tags: tags('夜晚的房间', ['自我'], ['自责', '平静'], [], ['家']),
  },

  // ── 以下 7 行让「一个人的时候」成为真实计数 ────────────────────────────
  // 跨度约 9 天，都带 theme `独处`。第 13 行故意落在 7 天窗口之外：
  // 所以「一共 7 次」与「7 天里 6 次」两个数能同时成立。
  {
    kind: 'word',
    text: '终于没人找我了。',
    minutesAgo: 60,
    tags: tags('', ['独处'], ['停顿', '平静']),
  },
  {
    kind: 'sound',
    minutesAgo: 1440,
    tags: tags('深夜的房间', ['独处'], ['平静'], [], ['家']),
  },
  {
    kind: 'word',
    text: '把灯都关了，屋里只剩冰箱的声音。',
    minutesAgo: 2880,
    tags: tags('', ['独处', '自我'], ['停顿', '平静']),
  },
  {
    kind: 'word',
    text: '走回家的路上，谁也没遇上。',
    minutesAgo: 4320,
    tags: tags('', ['独处'], ['疲惫']),
  },
  {
    kind: 'sound',
    minutesAgo: 7200,
    tags: tags('一个人的下午', ['独处'], ['轻松'], [], ['家']),
  },
  {
    kind: 'word',
    text: '把想说的话又咽回去了。',
    minutesAgo: 9600,
    tags: tags('', ['独处', '自我'], ['自责']),
  },
  {
    kind: 'word',
    text: '又是一个人吃饭。',
    minutesAgo: 12960,
    tags: tags('', ['独处'], ['平静']),
  },

  // ── 以下 2 行只服务于「发现」的**时间型**卡片 ──────────────────────────
  // 让「所有人安静以后」在演示里一定成卡（时间型卡片靠时间本身当证据，
  // 不能靠现场攒）。它们刻意不带 theme `独处`、不带 emotion `停顿`——
  // 所以 seed.reconcile.test.ts 盯的那两个数字（7 次 / 4 次）一个都没动。
  {
    kind: 'word',
    text: '这么晚了，还没睡。',
    atClock: [23, 47, 3],
    tags: tags('', ['休息'], ['平静'], [], ['家']),
  },
  {
    kind: 'sound',
    durationMs: 12_000,
    atClock: [23, 52, 10],
    tags: tags('深夜的房间', ['休息'], ['平静'], [], ['家']),
  },

  // ── 以下 14 行是一次完整的「上山」故事（2026-09-27 换真照片）──────────
  // 四册覆盖组合矩阵的四种典型（docs/23 §一「单类型与自由组合」）：
  //   孩子         照片+声音+一句话（三样平手 → 照片条封面，**真照片**）
  //   想不到的声音 纯声音 ×5（单类型 → 无段头，波形地平线封面）
  //   上山         照片+声音（声音占多 → **波形地平线封面**；真照片在卷内的照片段）
  //   山上的便签   纯文字 ×3（单类型 → 无段头，原句即封面）
  // 主导类型按占比取，平手才轮到「照片 > 声音 > 文字」——上山是 6 声 / 2 照，
  // 声音本就占多，封面是波形（docs/23 §一 的组合表也是这么写的：声音+照片 → 波形）。
  // 全部落在「昨天」的山上，一个故事说得通；刻意避开 theme `独处` 与
  // emotion `停顿`，对账测试盯的数字一个不动。
  {
    kind: 'photo',
    photoUrl: '/seed/p1.jpg',
    atClock: [10, 41, 1],
    tags: tags('排队上缆车，她一路都在数台阶', ['关系'], ['开心'], ['孩子'], ['山上'], ['缆车', '台阶', '排队']),
  },
  {
    kind: 'sound',
    durationMs: 12_000,
    atClock: [11, 5, 1],
    tags: tags('山风穿过栈道', ['关系'], ['平静'], ['孩子'], ['山上'], ['栈道', '山风']),
  },
  {
    kind: 'word',
    text: '她走了一半就喊累，后半程是自己走完的。',
    atClock: [11, 20, 1],
    tags: tags('', ['关系'], ['欣慰'], ['孩子'], ['山上']),
  },
  {
    kind: 'sound',
    durationMs: 31_000,
    atClock: [9, 48, 1],
    tags: tags('缆车的低鸣', ['出游'], ['平静'], [], ['山上'], ['缆车']),
  },
  {
    kind: 'sound',
    durationMs: 15_000,
    atClock: [10, 12, 1],
    tags: tags('栈道尽头的风', ['出游'], ['平静'], [], ['山上'], ['栈道', '山风']),
  },
  {
    kind: 'sound',
    durationMs: 21_000,
    atClock: [10, 30, 1],
    tags: tags('队伍踩过木板的脚步声', ['出游'], ['轻松'], [], ['山上']),
  },
  {
    kind: 'sound',
    durationMs: 9_000,
    atClock: [13, 2, 1],
    tags: tags('雾里传来的钟声', ['出游'], ['平静'], [], ['山上']),
  },
  {
    kind: 'sound',
    durationMs: 6_000,
    atClock: [15, 44, 1],
    tags: tags('索道滑轮的吱呀', ['出游'], ['轻松'], [], ['山上']),
  },
  {
    kind: 'photo',
    photoUrl: '/seed/p3.jpg',
    atClock: [12, 18, 1],
    tags: tags('雾把玛尼堆罩住了', ['出游'], ['惊奇'], [], ['山上']),
  },
  {
    kind: 'photo',
    photoUrl: '/seed/p4.jpg',
    atClock: [12, 40, 1],
    tags: tags('雾里的栈道，走到看不见来路', ['出游'], ['平静'], [], ['山上']),
  },
  {
    kind: 'sound',
    durationMs: 18_000,
    atClock: [12, 55, 1],
    tags: tags('雾里的鸟叫', ['出游'], ['平静'], [], ['山上']),
  },
  {
    kind: 'word',
    text: '雾大到看不见来路，也只能继续走。',
    atClock: [14, 5, 1],
    tags: tags('', ['出游'], ['平静'], [], ['山上']),
  },
  {
    kind: 'word',
    text: '山顶没有风景，只有风。',
    atClock: [14, 30, 1],
    tags: tags('', ['出游'], ['平静'], [], ['山上']),
  },
  {
    kind: 'word',
    text: '下山的时候，谁都没说话。',
    atClock: [16, 50, 1],
    tags: tags('', ['出游'], ['平静'], [], ['山上']),
  },

  // ── 一棵树的来历：跨了大半年，锚点是「树」这条**自由线索**，不是任何类别 ───────
  // 演示的是**长跨度、心情驱动**的合集（发现页的 d-tree）：类别里根本没有「一棵树」
  // 这种东西，它只活在认识它的那一刻留下的线索里。叙事不写大段——标题一句话，
  // 剩下的由文字 / 声音的时间线自己说。
  // 刻意避开 theme 独处 与 emotion 停顿：对账测试把这两样的条数钉死了（7 / 4）。
  // 也刻意都在 23–4 点之外：d-late 那条判据认的是深夜。
  {
    kind: 'word',
    text: '宿舍门口那棵树，树皮上有一道像裂缝的纹路。别人大概不会看第二眼。',
    atDate: [2025, 10, 12, 17, 40],
    tags: tags('宿舍门口那棵树', [], ['平静'], [], [], ['树', '树皮', '纹路', '宿舍门口']),
  },
  {
    kind: 'sound',
    durationMs: 19_000,
    atDate: [2025, 11, 3, 16, 20],
    tags: tags('树下的风', [], ['平静'], [], [], ['树', '秋风', '落叶']),
  },
  {
    kind: 'word',
    text: '它发芽那天我正好路过。',
    atDate: [2026, 3, 21, 12, 5],
    tags: tags('', [], [], [], [], ['树', '新芽']),
  },
  {
    kind: 'sound',
    durationMs: 8_000,
    atDate: [2026, 9, 20, 18, 30],
    tags: tags('树下有只猫在叫', [], [], [], [], ['树', '流浪猫', '白猫']),
  },
  {
    kind: 'word',
    text: '那只白猫最近总在树边上。它不认识我，我也不打扰它。',
    atDate: [2026, 9, 24, 19, 10],
    tags: tags('', [], ['平静'], [], [], ['树', '白猫', '流浪猫']),
  },
  // 故事还在继续：加一条今天的。它让这一册成为**最近发生的**那一册
  // （发现页按册内最近一条的时间倒序，它因此排在最上），也顺带把首页球下那句
  // 换成它——想换回去，把 minutesAgo 调大到 11 以上即可。
  {
    kind: 'word',
    text: '今天路过，它的叶子开始黄了。',
    minutesAgo: 3,
    tags: tags('', [], ['平静'], [], [], ['树', '落叶', '黄叶']),
  },
  // 照片给三个场景各留了一张位。文件还没有时**不报错**：seedIfEmpty 拉不到就跳过，
  // 这一行照常落下，界面走降级渐变（与相机不可用时同一条路）。
  // 把图丢进 app/public/seed/ 用下面这三个名字，重开一次就是真图。
  {
    kind: 'photo',
    photoUrl: '/seed/tree-bark.jpg',
    atDate: [2025, 10, 12, 17, 42],
    tags: tags('树皮上那道纹路', [], ['平静'], [], [], ['树', '树皮', '纹路']),
  },
  {
    kind: 'photo',
    photoUrl: '/seed/tree-autumn.jpg',
    atDate: [2025, 11, 3, 16, 23],
    tags: tags('秋天，树下', [], ['平静'], [], [], ['树', '秋风', '落叶']),
  },
  {
    kind: 'photo',
    photoUrl: '/seed/tree-cat.jpg',
    atDate: [2026, 9, 20, 18, 32],
    tags: tags('白猫在树边', [], [], [], [], ['树', '流浪猫', '白猫']),
  },
]

function resolveCreatedAt(row: SeedRow, now: number): number {
  if (row.atDate) {
    const [y, m, d, h, min] = row.atDate
    return new Date(y, m - 1, d, h, min, 0, 0).getTime()
  }
  if (row.atClock) {
    const [h, min, daysAgo] = row.atClock
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(h, min, 0, 0)
    return d.getTime()
  }
  return now - (row.minutesAgo ?? 0) * MIN
}

export async function seedIfEmpty(): Promise<void> {
  if (!seed.enabled) return

  // 种子有版本号。库里存的版本比这里旧（或库是空的）就整体重灌——
  // seedIfEmpty 的老规则「只在空库灌一次」会让演示浏览器永远停在旧故事上，
  // 新加的真照片与册永远不会出现。重灌前清空 entries / blobs / watches，
  // meta 里记下版本号，之后同样的库不再动。
  const SEED_VERSION = 4

  const needsSeed = await (async () => {
    const stored = await db.meta.get('seedVersion')
    if ((stored?.value as number | undefined) !== SEED_VERSION) return true
    return (await db.entries.count()) === 0
  })()
  if (!needsSeed) return

  // 照片在事务外取（fetch 不能进 IndexedDB 事务）。取不到就按没有图灌——
  // 缺一张种子照片不该挡住整个演示。
  const photoBlobs = new Map<string, { blob: Blob; mimeType: string }>()
  await Promise.all(
    ROWS.filter((row) => row.photoUrl).map(async (row) => {
      try {
        const res = await fetch(row.photoUrl!)
        if (!res.ok) return
        photoBlobs.set(row.photoUrl!, { blob: await res.blob(), mimeType: 'image/jpeg' })
      } catch {
        /* 离线 / 文件缺失：这张种子就没有图，界面走降级渐变。 */
      }
    }),
  )

  // 判断与写入必须在同一个事务里。
  //
  // StrictMode 下 hydrate 会跑两次，于是有两个并发的 seedIfEmpty。若 count() 在事务外，
  // 两个调用会同时看到空库、各灌一遍——浏览器里实测就是 26 条而不是 13 条，于是
  // 「过去 7 天有 8 次」这种翻倍的数字被说了出来。IndexedDB 对同一批 store 的读写事务
  // 是串行的，所以放进事务之后，第二个调用一定看得到第一个写下的行。
  await db.transaction('rw', db.entries, db.blobs, db.watches, db.meta, async () => {
    const stored = await db.meta.get('seedVersion')
    if ((stored?.value as number | undefined) === SEED_VERSION && (await db.entries.count()) > 0) {
      return
    }

    // 重灌 = 整库换成这一版的故事。旧 entries / blobs / watches 一起清，
    // 不留半套新旧混合的数据。
    await Promise.all([db.entries.clear(), db.blobs.clear(), db.watches.clear()])

    const now = Date.now()

    const ids = ROWS.map(() => createId('seed'))
    const blobWrites: Promise<unknown>[] = []
    await db.entries.bulkPut(
      ROWS.map((row, i) => {
        const entry: Entry = {
          id: ids[i],
          kind: row.kind,
          createdAt: resolveCreatedAt(row, now),
          tags: row.tags,
          tagSource: 'seed',
        }
        if (row.text !== undefined) entry.text = row.text
        if (row.durationMs !== undefined) entry.durationMs = row.durationMs
        const photo = row.photoUrl ? photoBlobs.get(row.photoUrl) : undefined
        if (photo) {
          entry.blobRef = `${ids[i]}:blob`
          blobWrites.push(
            db.blobs.put({ id: entry.blobRef, blob: photo.blob, mimeType: photo.mimeType }),
          )
        }
        return entry
      }),
    )
    await Promise.all(blobWrites)
    await db.meta.put({ key: 'seedVersion', value: SEED_VERSION })
  })
}
