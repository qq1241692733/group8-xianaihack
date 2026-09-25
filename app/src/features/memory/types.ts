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
  /** 工作 / 休息 / 关系 / 自我 / 身体 */
  themes: string[]
  /** 逃避 / 疲惫 / 焦虑 / 平静 / 轻松 / 自责 */
  emotions: string[]
  people: string[]
  places: string[]
}

export type TagSource = 'llm' | 'rule' | 'seed'

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
}

export const EMPTY_TAGS: EntryTags = {
  scene: '',
  themes: [],
  emotions: [],
  people: [],
  places: [],
}

export function createEmptyTags(): EntryTags {
  return { scene: '', themes: [], emotions: [], people: [], places: [] }
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
