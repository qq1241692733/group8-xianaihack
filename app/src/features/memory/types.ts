/**
 * 数据模型。
 *
 * ── 把「无用」写进 schema ──────────────────────────────────────
 * 下面这几条硬约束不是风格偏好，是产品设计：
 *
 *  1. 没有 streak、没有 completionRate、没有 dailyGoal。
 *     首页那四个坏掉的数字之所以显示「—」，不是忘了渲染，是算不出来——字段根本不存在。
 *  2. focusSession（3 分钟专注）不落库、不进任何表。结束即消失，不留痕迹。
 *  3. Entry 上没有任何可用于排名的数值。时间流只能按 createdAt 排序，做不出排行榜。
 *  4. 没有任何 done / completed / status 字段。这里不存在"完成了"这件事。
 *
 * 类型系统里表达不出来的"有用"，界面上也就做不出来。
 * 这一条比任何一句文案都管用，所以它写在类型里，不写在文案里。
 * ────────────────────────────────────────────────────────────
 */

export type EntryKind = 'sound' | 'photo' | 'word'

/** 标签由 AI 在**写入那一刻**提取一次，是一次不可回退的加工。 */
export interface EntryTags {
  /** 环境声类型 / 画面描述，一句话。 */
  scene: string
  /** 工作 / 休息 / 关系 / 自我 / 身体 / 独处 */
  themes: string[]
  /** 停顿 / 疲惫 / 焦虑 / 平静 / 轻松 / 自责 */
  emotions: string[]
  people: string[]
  places: string[]
  /**
   * 认识它的那一刻记下的**自由线索** —— 具体是什么东西、什么场合、什么动作。
   *
   * **不受词表限制**，这是它与上面四个维度的根本差别。为什么非留不可：
   * 受控词表换来「标签机器可用」，代价是丢掉真正特殊的那些词（实测被丢过的：
   * 「自然风光」「排队」「山间栈道」）。而恰恰是这些词，才是长跨度合集的唯一抓手
   * ——一个杯子从陌生到熟悉、孩子的每一个「第一次」，锚点是**具体的物与事**，
   * 不是「关系 / 出游」这种类别。
   *
   * 认识一张照片只有**那一次**机会：当时没把线索记下来，以后就再也追不回来了
   * （与 repo.ts「此刻撒的谎以后就追不回来了」同一条纪律）。所以宁可多留。
   *
   * 检索时按**子串**匹配（`entryMatches`），与 scene / text 同一个待遇。
   */
  clues: string[]
}

export type TagSource = 'llm' | 'rule' | 'seed'

/**
 * 采集侧的原始信号（EXIF / 视觉特征 / 音频特征）。
 *
 * 这些量**不进标签**：从亮度推不出"平静"，推了就是撒谎（见 extract.ts 的纪律）。
 * 它们是客观测量值，放进 meta，检索时用内存过滤读——与「标签维度不建索引」
 * 是同一条思路（db.ts）。
 */
export interface ExifMeta {
  /** DateTimeOriginal，已知的拍摄时刻。进时间流时优先于上传时间。 */
  takenAt?: number
  /** 1..8，仅记录，暂无消费方。 */
  orientation?: number
  gps?: { lat: number; lon: number }
}

export interface VisualFeatures {
  /** 平均亮度 0..1。 */
  brightness: number
  /** 色温，平均 (R−B)/255 归一：>0 偏暖。 */
  warmth: number
  /** 平均饱和度 0..1。 */
  saturation: number
}

export interface AudioFeatures {
  /** 平均响度 0..1，本地粗量。 */
  loudness: number
}

/** 一条记录携带的原始采集信号。可选——只有那些采到时才存在。 */
export interface EntryMeta {
  exif?: ExifMeta
  visual?: VisualFeatures
  /** dHash（16 位十六进制），用于近似重复去重与挑代表帧。 */
  hash?: string
  audio?: AudioFeatures
  /** 照片来路：快门 / 相册。相册来的时间流可能落在过去。 */
  source?: 'camera' | 'library'
}

export interface Entry {
  id: string
  kind: EntryKind
  createdAt: number
  /** 写下的句子，或可选的语音转写。声音可以只有声音。 */
  text?: string
  durationMs?: number
  /** blobs 表里的 key。原始音频 / 图片不进这里，Entry 保持轻量。 */
  blobRef?: string
  tags: EntryTags
  tagSource: TagSource
  /** 采集侧的原始信号（EXIF / 视觉 / 哈希 / 音频）。不参与标签，供检索用。 */
  meta?: EntryMeta
  /**
   * 同一个「此刻」里一起落下的几条记录共享它。
   *
   * 「此刻」是一个事务：拍张照、再写句心情，它们是一件事，不是一个照片加一句话。
   * 检索命中其中任一条时，`expandToMoments` 把整个「此刻」一起带出来。
   * 单独留下的一条没有这个字段。
   */
  momentId?: string
}

/** 采集阶段产出的东西：还没有标签，还不知道"这意味着什么"。 */
export interface EntryDraft {
  kind: EntryKind
  text?: string
  durationMs?: number
  /** 采集时的现场线索，交给标签提取当参考（如相机里那句「窗外」）。 */
  sceneHint?: string
  /** 原始音频 / 图片。有它才会写一条 blobs 记录。 */
  blob?: Blob
  blobMimeType?: string
  createdAt?: number
  /** 采集侧信号，由各采集组件产出，写进 Entry.meta。 */
  exif?: ExifMeta
  visual?: VisualFeatures
  imageHash?: string
  audio?: AudioFeatures
  source?: 'camera' | 'library'
  /**
   * **用户自己写的**线索（「记录此刻」里的那行标签）。
   *
   * 它和 LLM 认出来的线索是同一类东西——具体的物与事，只是来源不同——所以走同一个字段、
   * 同一个检索面。不查词表：用户写什么就是什么（见 EntryTags.clues 的说明）。
   */
  clues?: string[]
}

export const EMPTY_TAGS: EntryTags = {
  scene: '',
  themes: [],
  emotions: [],
  people: [],
  places: [],
  clues: [],
}

export function createEmptyTags(): EntryTags {
  return { scene: '', themes: [], emotions: [], people: [], places: [], clues: [] }
}

/** 三种「此刻」的中文名。界面一律用它，不在各处硬编码。 */
export const KIND_LABEL: Record<EntryKind, string> = {
  sound: '声音',
  photo: '照片',
  word: '一句话',
}

/** 列表与痕迹里那个小标记。 */
export const KIND_MARK: Record<EntryKind, string> = {
  sound: '🎧',
  photo: '📷',
  word: '✍️',
}
