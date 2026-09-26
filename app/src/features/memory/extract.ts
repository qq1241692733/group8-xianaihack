import { createEmptyTags, type EntryDraft, type EntryTags, type VisualFeatures } from './types'

/**
 * 写入时的一次性加工：把一句话、或其他采集时留下的线索，映射成可检索的标签。
 *
 * 为什么是规则而不是 LLM：写入路径必须同步、离线、可重复。LLM 那条路（tags.schema.ts
 * 的 parseLlmTags）是可选增强，并且如实标成 'llm'——与 'rule' 分得清清楚楚。
 * repo.ts 的注释警告过：此刻撒的谎，以后就追不回来了。
 *
 * 词典刻意不含任何评价性 / 成就性词（完成、坚持、进步、加油…）。类型系统里表达不出
 * 来的「有用」，界面上也就做不出来——这条同样适用于标签。
 */

type Rule = readonly [keywords: readonly string[], tag: string]

/**
 * 词典按「生活证据」原则重写（见 docs/05）：不再以「工作 / 项目 / 逃避」为核心，
 * 而是收那些能指向生活本身的词——一个人的时候、停下来的时候。
 *
 * 产出的标签值**必须落在 vocabulary.ts 的词表里**：规则提取与 LLM 提取共用同一套词，
 * 本地判据与检索才比得中。加词时两处都要动。
 */
const THEME_RULES: readonly Rule[] = [
  [['一个人', '独自', '独处', '没人', '自己待着', '剩下我'], '独处'],
  [['工作', '加班', '开会', '上班', '任务', 'deadline', '赶工'], '工作'],
  [['休息', '睡觉', '睡', '躺', '歇', '放假', '周末', '闲着'], '休息'],
  [['朋友', '家人', '父母', '家里', '同事', '女朋友', '男朋友', '争吵'], '关系'],
  [['自己', '自我', '内耗', '比较', '不够好', '心虚'], '自我'],
  [['累', '困', '头疼', '身体', '失眠', '睡不着'], '身体'],
  [['出游', '爬山', '登山', '远足', '露营', '出门玩', '逛', '看展', '旅行'], '出游'],
]

const EMOTION_RULES: readonly Rule[] = [
  [['停了一下', '停下来', '站了', '站了会', '发呆', '愣', '没动', '犹豫', '迟疑'], '停顿'],
  [['疲惫', '很累', '好累', '太累', '累死', '没力气', '撑不住', '乏'], '疲惫'],
  [['焦虑', '慌', '紧张', '害怕', '担心', '不安'], '焦虑'],
  [['平静', '安静', '放松', '安稳', '静下来'], '平静'],
  [['轻松', '开心', '高兴', '愉快', '舒服', '自在'], '轻松'],
  [['自责', '怪自己', '后悔', '内疚', '愧疚', '对不起', '做得很少', '做得不好'], '自责'],
]

const PLACE_RULES: readonly Rule[] = [
  [['咖啡厅', '咖啡馆', '咖啡'], '咖啡厅'],
  [['家', '房间', '卧室', '客厅', '床上'], '家'],
  [['公司', '办公室', '工位'], '公司'],
  [['地铁', '公交', '车里'], '地铁'],
  [['外面', '街上', '路边', '公园'], '外面'],
  [['山上', '山顶', '山脚', '缆车', '索道', '栈道'], '山上'],
]

const PEOPLE_RULES: readonly Rule[] = [
  [['妈妈', '爸爸', '父母'], '家人'],
  [['朋友'], '朋友'],
  [['同事'], '同事'],
  [['女朋友', '男朋友'], '伴侣'],
  [['孩子', '小孩', '宝宝', '儿子', '女儿'], '孩子'],
]

function collect(haystack: string, rules: readonly Rule[]): string[] {
  const found: string[] = []
  for (const [keywords, tag] of rules) {
    if (found.includes(tag)) continue
    if (keywords.some((keyword) => haystack.includes(keyword))) found.push(tag)
  }
  return found
}

/**
 * 从一次采集里提取标签。永不抛错：匹配不到就是空标签，不是失败。
 *
 * `scene` 只取采集时的现场线索（如相机里那句「窗外」）；没有线索时退而用
 * 匹配到的第一个地点名词。**不替它编句子**——display.ts 已经立过这条规矩。
 */
export function extractTags(draft: EntryDraft): EntryTags {
  const haystack = [draft.text ?? '', draft.sceneHint ?? ''].join(' ')
  const tags = createEmptyTags()

  tags.themes = collect(haystack, THEME_RULES)
  tags.emotions = collect(haystack, EMOTION_RULES)
  tags.places = collect(haystack, PLACE_RULES)
  tags.people = collect(haystack, PEOPLE_RULES)
  tags.scene = draft.sceneHint?.trim() || tags.places[0] || ''

  return tags
}

/**
 * 本地视觉特征 → 一句中性的画面描述。
 *
 * 只写**客观可测量的东西**：一天里的时段、明暗、色温。"夜里的暖光"是从像素里
 * 量出来的；"安静的夜"不是——后者要猜心情，猜了就是撒谎（与词典不收评价词同一条纪律）。
 * 所以这里**绝不产出 themes / emotions / people / places**，只产出 scene。
 */
export function sceneFromFeatures(f: VisualFeatures, hour: number): string {
  const timeWord = hour < 9 ? '清晨的' : hour < 17 ? '白天的' : hour < 20 ? '傍晚的' : '夜里的'

  const lightWord =
    f.warmth > 0.08 ? '暖光' : f.warmth < -0.08 ? '冷光' : f.brightness < 0.28 ? '暗光' : f.brightness < 0.45 ? '微光' : '光'

  return `${timeWord}${lightWord}`
}

/**
 * 本地打标入口 = 规则层（extractTags）+ 元数据层（视觉特征）。
 *
 * repo 只调这一个。规则层永远先跑；照片带视觉特征时，用它量出来的 scene 覆盖
 * 采集时那句通用线索（相机路径的 sceneHint 不是用户写的，是常量，不比重出来的准）。
 * 永不抛错——匹配不到就是空标签，不是失败。
 */
export function deriveLocalTags(draft: EntryDraft): EntryTags {
  const tags = extractTags(draft)
  if (draft.visual) {
    const at = draft.exif?.takenAt ?? draft.createdAt ?? Date.now()
    tags.scene = sceneFromFeatures(draft.visual, new Date(at).getHours())
  }
  // 用户自己写的那行标签也是线索：与 LLM 认出来的进同一个字段、同一个检索面。
  if (draft.clues?.length) {
    tags.clues = [...new Set([...draft.clues.map((c) => c.trim()).filter(Boolean), ...tags.clues])]
  }
  return tags
}

/** 供测试断言词典里不含评价性 / 成就性标签。 */
export const LEXICON: ReadonlyArray<readonly Rule[]> = [
  THEME_RULES,
  EMOTION_RULES,
  PLACE_RULES,
  PEOPLE_RULES,
]
