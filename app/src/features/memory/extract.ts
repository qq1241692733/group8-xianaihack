import { createEmptyTags, type EntryDraft, type EntryTags } from './types'

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

const THEME_RULES: readonly Rule[] = [
  [['项目', '需求', '上线', '版本', '方案', '文档', '汇报', '进度', '产品'], '项目'],
  [['工作', '加班', '开会', '上班', '任务', 'deadline', '赶工'], '工作'],
  [['休息', '睡觉', '睡', '躺', '歇', '放假', '周末', '闲着'], '休息'],
  [['朋友', '家人', '父母', '家里', '同事', '女朋友', '男朋友', '争吵'], '关系'],
  [['自己', '自我', '内耗', '比较', '不够好', '心虚'], '自我'],
  [['累', '困', '头疼', '身体', '失眠', '睡不着'], '身体'],
]

const EMOTION_RULES: readonly Rule[] = [
  [['逃避', '拖延', '拖沓', '躲', '摆烂', '抗拒', '不想做', '不想工作', '提不起', '没动'], '逃避'],
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
]

const PEOPLE_RULES: readonly Rule[] = [
  [['妈妈', '爸爸', '父母'], '家人'],
  [['朋友'], '朋友'],
  [['同事'], '同事'],
  [['女朋友', '男朋友'], '伴侣'],
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

/** 供测试断言词典里不含评价性 / 成就性标签。 */
export const LEXICON: ReadonlyArray<readonly Rule[]> = [
  THEME_RULES,
  EMOTION_RULES,
  PLACE_RULES,
  PEOPLE_RULES,
]
