import type { TagDim } from '@/features/memory/aggregate'
import { expandToMoments, entryMatches } from '@/features/memory/query'
import type { Entry, EntryKind } from '@/features/memory/types'
import type { Collection } from '@/data/collections'
import type { Watch } from '@/data/watches'
import { watchMatches } from '@/data/watches'

/**
 * 「发现」的数据。
 *
 * 与 seed.ts 同构：预置示例，正式包把 enabled 改成 false。
 *
 * 与 seed 最大的不同——**这里不存死数据**。每条「连接」存的是一个判据（match），
 * 卡片内容在渲染时从真实记录里现算：条数、起止日期、展开后看到的原件，全部来自库存。
 *
 * 为什么这么做：截图里那行「2026.09.10 — 09.26」不是文案，是从记录里数出来的。
 * 一旦写成字面量，改一条种子就会让卡片开始撒谎。而演示时最不能接受的失败，
 * 就是点开一张发现卡，却被告知「内容不存在」。
 *
 * ── 档案化（docs/23）───────────────────────────────────────
 * 卡片升格为「册」，来源分四类（origin）：
 *  - judge：预置判据聚的（示例连接，界面上如实标出）
 *  - watch：守望聚的（用户立过的词，按词从记录里现算）
 *  - custom：自建合集（用户自己挑的记录，存的是选择本身）
 *  - promoted / llm：理解页推来的 / 模型判定成册的
 * 卷的形态（封面材质、段结构）由 volumeOf 现算——组合是数据，呈现是
 * 类型驱动的确定性模板，AI 不排版。
 * ───────────────────────────────────────────────────────────
 */

export const discoveries = { enabled: true }

/** 两种轴。这不是巧合，是「不写情绪标签，写生活证据」的两条落地路径。 */
export type DiscoveryAxis = 'theme' | 'time'
/** 缩略：主题型用插画光斑，时间型用大字时间。 */
export type DiscoveryThumb = 'scene' | 'clock'

/** 册的四种来源。 */
export type DiscoveryOrigin = 'judge' | 'watch' | 'promoted' | 'llm' | 'custom'

/** LLM 判定成册时的类型：纯事件 / 情绪+事件。 */
export type VolumeKind = 'event' | 'mixed'

export interface DiscoveryDef {
  id: string
  axis: DiscoveryAxis
  title: string
  note: string
  thumb: DiscoveryThumb
  /** 命中哪些记录。至少两条才会成卡——一条不叫「联系」。 */
  match: (entry: Entry) => boolean
}

export interface DiscoveryCard {
  id: string
  axis: DiscoveryAxis
  title: string
  note: string
  thumb: DiscoveryThumb
  /** 引用到的原始记录，createdAt 倒序。展开后先看到它们，再看到结论。 */
  items: Entry[]
  /** 真实起止。跨度字段必须等于所引用记录的真实起止。 */
  from: number
  to: number
  /** 这张卡的来源：预置判据 / 守望 / 用户从理解页推来的 / LLM 判定成册。 */
  origin: DiscoveryOrigin
  /** 只有 LLM 成册带：纯事件还是情绪+事件。其余来路不带。 */
  kindType?: VolumeKind
  /** 守望册带上守望词——封面「留意着」标记与撤回边界要用它。 */
  watchWord?: string
  /** 自建合集带上它的库 id——卷内的「解散」要拿它去 db 里删（封面上那枚角标也用它）。 */
  collectionId?: string
}

const hourOf = (ts: number): number => new Date(ts).getHours()

/**
 * 判据表。三条覆盖两种轴：
 *  - 主题型：按 tags.themes / tags.scene 命中
 *  - 时间型：按「一天里的位置」命中——23:47 和 23:52 不需要任何形容词，你一看就懂
 *
 * 主题按「生活证据」重写：不再数「那个项目」（工作焦虑），而是数「一个人的时候」——
 * 后者才是这个产品真正在观察的东西。
 */
export const DISCOVERY_DEFS: DiscoveryDef[] = [
  {
    id: 'd-alone',
    axis: 'theme',
    title: '一个人的时候',
    note: '留下这些东西的时候，你都是一个人。',
    thumb: 'scene',
    match: (e) => e.tags.themes.includes('独处'),
  },
  {
    id: 'd-window',
    axis: 'theme',
    title: '总是同一个地方',
    note: '照片和声音，都从那里来。',
    thumb: 'scene',
    match: (e) => e.tags.places.includes('家') || e.tags.scene.includes('窗外'),
  },
  {
    id: 'd-late',
    axis: 'time',
    title: '所有人安静以后',
    note: '这几次，你都在深夜才留下东西。',
    thumb: 'clock',
    match: (e) => {
      const h = hourOf(e.createdAt)
      return h >= 23 || h < 4
    },
  },
  {
    // 上山：照片 + 声音的组合（纯文字留给下一册，两种组合各是各的样子）。
    id: 'd-uphill',
    axis: 'theme',
    title: '上山',
    note: '照片和声音，都发生在昨天山上。',
    thumb: 'scene',
    match: (e) => e.tags.themes.includes('出游') && e.kind !== 'word',
  },
  {
    id: 'd-notes',
    axis: 'theme',
    title: '山上的便签',
    note: '留下这些的时候，你都在山上。',
    thumb: 'scene',
    match: (e) => e.tags.themes.includes('出游') && e.kind === 'word',
  },
  {
    // 长跨度、心情驱动的合集：判据认的是**自由线索**「树」，不是任何类别——
    // 「一棵树」「一道纹路」在 themes / places 里根本不存在，它们只活在认识它的
    // 那一刻留下的线索里（见 24 §五）。跨了大半年，靠的正是那些线索。
    // 叙事不写大段：标题一句，剩下的由文字与声音的时间线自己说。
    id: 'd-tree',
    axis: 'theme',
    title: '门口那棵树',
    note: '你注意到的，别人大概不会看第二眼。',
    thumb: 'scene',
    match: (e) => e.tags.clues.some((clue) => clue.includes('树')),
  },
]

/** 成卡门槛：至少两条。一条不叫「联系」。 */
export const MIN_ITEMS = 2

/**
 * 一条判据 + 一批记录 → 一张卡。够了就成卡，不够返回 null。
 *
 * 这是**唯一**的成卡逻辑：发现页的预置连接（buildDiscoveries）、守望册、
 * 「理解」页用户自己点出来的档案（data/prompts.ts）都走这里。同一条判据因此
 * 只有一处定义，改一处两边一起变——不会出现「发现页说 7 次、理解页说 5 次」
 * 这种自相矛盾。
 */
export function cardFromDef(
  def: DiscoveryDef,
  entries: readonly Entry[],
  origin: DiscoveryOrigin,
): DiscoveryCard | null {
  // 命中之后先把整个「此刻」带出来：判据只命中照片，「出游」那一册里也该有同组那句话。
  const items = expandToMoments(entries, entries.filter(def.match))
  if (items.length < MIN_ITEMS) return null

  // from / to 从记录里数出来，不写文案
  let from = items[0].createdAt
  let to = items[0].createdAt
  for (const item of items) {
    if (item.createdAt < from) from = item.createdAt
    if (item.createdAt > to) to = item.createdAt
  }

  return {
    id: def.id,
    axis: def.axis,
    title: def.title,
    note: def.note,
    thumb: def.thumb,
    items,
    from,
    to,
    origin,
  }
}

/**
 * 一个守望词 → 一册。
 *
 * 册名就是守望词本身——AI 起名是后续的装饰层（docs/23 §三），本地回落态
 * 诚实用词；note 说的是守望的作为，不编引子句。
 * 守望撤回后这个函数自然不再产出这一册，无需清理——守望不存产出。
 */
export function watchCard(watch: Watch, entries: readonly Entry[]): DiscoveryCard | null {
  // 与 cardFromDef 同一条纪律：命中之后先把整个「此刻」带出来。
  const items = expandToMoments(entries, entries.filter((e) => watchMatches(watch, e)))
  if (items.length < MIN_ITEMS) return null

  let from = items[0].createdAt
  let to = items[0].createdAt
  for (const item of items) {
    if (item.createdAt < from) from = item.createdAt
    if (item.createdAt > to) to = item.createdAt
  }

  return {
    id: `w-${watch.id}`,
    axis: 'theme',
    title: watch.word,
    note: '替你留意着，聚起来的。',
    thumb: 'scene',
    items,
    from,
    to,
    origin: 'watch',
    watchWord: watch.word,
  }
}

/**
 * 一个标签值 → 一册。标签值即册名。
 *
 * 这是「AI 根据标签搜索/整理」的成册口：标签是写入时（规则 + 元数据 + 可选 LLM）
 * 已经落到每条记录上的东西，这里只把它们拢起来。**复用 cardFromDef**（MIN_ITEMS、
 * from/to 现算），不新增成卡逻辑——与 judge / watch 两条来路共用一个口。
 *
 * origin = 'promoted'：它不是预置示例，是从你已有记录里长出来的、已经存在的一册。
 */
export function tagCardFrom(
  label: string,
  dim: TagDim,
  entries: readonly Entry[],
): DiscoveryCard | null {
  return cardFromDef(
    {
      id: `tag-${dim}-${label}`,
      axis: 'theme',
      title: label,
      note: '按这个标签拢起来的。',
      thumb: 'scene',
      match: (e) => e.tags[dim].includes(label),
    },
    entries,
    'promoted',
  )
}

/**
 * 一条**自由线索** → 一册。线索即册名。
 *
 * 与 `tagCardFrom` 是姊妹，但语义不同：那个按**闭集标签值**（整词相等），
 * 这个按**开集线索**做子串命中——用户说「杯子」，该找到标了「马克杯」的那条；
 * 说「缆车」，该找到「排队上缆车」。线索是具体的物与事，没人会逐字复述。
 *
 * 匹配面复用 `entryMatches`（与守望同一份实现），所以正文与画面描述里的词也算数。
 * 同样**复用 cardFromDef**（MIN_ITEMS、from/to 现算、带回整个「此刻」），不新增成卡逻辑。
 *
 * 这是长跨度合集的入口：一个物件从陌生到熟悉，锚点就是这样一个具体的词。
 */
export function clueCardFrom(needle: string, entries: readonly Entry[]): DiscoveryCard | null {
  return cardFromDef(
    {
      id: `clue-${needle}`,
      axis: 'theme',
      title: needle,
      note: '按这条线索拢起来的。',
      thumb: 'scene',
      match: (e) => entryMatches(e, [needle]),
    },
    entries,
    'promoted',
  )
}

/**
 * LLM 判定成册的产物 → 一张卡。
 *
 * 与标签卡同一条纪律：**复用 cardFromDef**（MIN_ITEMS、from/to 现算），不新增成卡逻辑。
 * 判定内容（册名 / 引子 / 类型）由模型给，但**够不够成卡、起止是几号，仍由本地数**——
 * 模型定「是不是一件事」，代码定「这一册长什么样」。
 *
 * origin = 'llm'：它不是预置示例，是模型提议、用户还没确认的一册（草稿）。
 */
export function cardFromVerdict(
  verdict: { kind: VolumeKind; title: string; note: string },
  entries: readonly Entry[],
  memberIds: readonly string[],
): DiscoveryCard | null {
  const ids = new Set(memberIds)
  const card = cardFromDef(
    {
      id: `llm-${verdict.kind}-${memberIds[0] ?? 'x'}`,
      axis: 'theme',
      title: verdict.title,
      note: verdict.note,
      thumb: 'scene',
      match: (e) => ids.has(e.id),
    },
    entries,
    'llm',
  )
  if (card) card.kindType = verdict.kind
  return card
}

/**
 * 一个自建合集 → 一册。
 *
 * 与守望、判据两条来路**共用 cardFromDef**（MIN_ITEMS、from/to 现算、带回整个「此刻」），
 * 不新增成卡逻辑。唯一的差别是判据：不是「词命中」，是「id 在用户挑中的那组里」。
 *
 * 命中后照例 `expandToMoments`——你挑了一条照片，同组那句话也会跟进来。
 * 这是「一个此刻是原子的」那条规矩在新来路上的同一句话，不是 bug。
 */
export function collectionCardFrom(
  collection: Collection,
  entries: readonly Entry[],
): DiscoveryCard | null {
  const ids = new Set(collection.entryIds)
  const card = cardFromDef(
    {
      id: `c-${collection.id}`,
      axis: 'theme',
      title: collection.name,
      note: '你自己拢的一册。',
      thumb: 'scene',
      match: (e) => ids.has(e.id),
    },
    entries,
    'custom',
  )
  if (card) card.collectionId = collection.id
  return card
}

export function buildDiscoveries(
  entries: readonly Entry[],
  watches: readonly Watch[] = [],
  collections: readonly Collection[] = [],
): DiscoveryCard[] {
  if (!discoveries.enabled) return []

  const cards: DiscoveryCard[] = []
  // 先按来路收齐：守望册在前，然后自建合集（都是你亲手立下的），最后判据表。
  // 守望在前这条规矩没有丢——见下面的排序注释。
  for (const watch of watches) {
    const card = watchCard(watch, entries)
    if (card) cards.push(card)
  }
  for (const collection of collections) {
    const card = collectionCardFrom(collection, entries)
    if (card) cards.push(card)
  }
  for (const def of DISCOVERY_DEFS) {
    const card = cardFromDef(def, entries, 'judge')
    if (card) cards.push(card)
  }

  // **新的记录放在最上边**：按这一册里最近一条的时间倒序。
  // 一个「刚刚还发生过」的故事，比一个早已停下的故事更该先被看见。
  // `to` 就是册内记录的 max(createdAt)，所以这是真实时间，不是「谁先被写进代码」。
  //
  // 打平的时候 Array.sort 是**稳定**的，于是保持上面的原顺序 ——
  // 「守望册在前」因此仍然生效：它不是被推翻，只是让位给刚发生过的事。
  return cards.sort((a, b) => b.to - a.to)
}

/* ---------- 卷结构（docs/23 §二）：组合是数据，呈现是模板 ---------- */

/** 段的固定顺序：从证据到人。声音是环境给的，照片是眼睛给的，一句话是你给的。 */
const SECTION_ORDER: EntryKind[] = ['sound', 'photo', 'word']

export interface VolumeSection {
  kind: EntryKind
  items: Entry[]
}

export interface Volume {
  /** 封面材质 = 主导类型。 */
  lead: EntryKind
  /** 有内容的段，按固定顺序排好。 */
  sections: VolumeSection[]
  /** 单类型册：唯一的段不必自报家门（无段头）。 */
  single: boolean
}

/**
 * 一册 → 卷内结构。三条规则（docs/23 §二），全部确定性，无 AI：
 *  1. 段按类型出现，顺序固定：声音 → 照片 → 一句话；没有的类型不出现，也不凑。
 *  2. 主导类型内部按占比取，平手时照片 > 声音 > 文字（照片最有封面相）。
 *     **界面永不显示占比**。
 *  3. 单类型册不显示段头。
 */
export function volumeOf(card: DiscoveryCard): Volume {
  const sections: VolumeSection[] = SECTION_ORDER.map((kind) => ({
    kind,
    items: card.items.filter((e) => e.kind === kind),
  })).filter((s) => s.items.length > 0)

  const count: Record<EntryKind, number> = { sound: 0, photo: 0, word: 0 }
  for (const e of card.items) count[e.kind]++

  // 平手序：照片 > 声音 > 文字。照片最有封面相（docs/23 §二）。
  const tie: Record<EntryKind, number> = { photo: 3, sound: 2, word: 1 }
  let lead: EntryKind = 'word'
  for (const kind of SECTION_ORDER) {
    if (count[kind] > count[lead] || (count[kind] === count[lead] && tie[kind] > tie[lead])) {
      lead = kind
    }
  }

  return { lead, sections, single: sections.length === 1 }
}

const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

/** 封面上的期间词：从真实起止里取，同月一个词，跨月一个区间。 */
export function formatEra(card: DiscoveryCard): string {
  const a = new Date(card.from)
  const b = new Date(card.to)
  const ma = MONTHS[a.getMonth()]
  const mb = MONTHS[b.getMonth()]
  return ma === mb ? ma : `${ma}—${mb}`
}

/** 「示例连接 · 2026.09.10 — 09.26」。同一天就不摆一个多余的横杠。 */
export function formatSpan(card: DiscoveryCard): string {
  const a = new Date(card.from)
  const b = new Date(card.to)
  const head = `${a.getFullYear()}.${pad2(a.getMonth() + 1)}.${pad2(a.getDate())}`
  if (card.from === card.to) return head
  return `${head} — ${pad2(b.getMonth() + 1)}.${pad2(b.getDate())}`
}

/** 时间型卡的缩略：把两条时间竖着摆出来，当证据用。 */
export function clockStrip(card: DiscoveryCard): string[] {
  return card.items.slice(0, 2).map((item) => {
    const d = new Date(item.createdAt)
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  })
}

function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n
}

