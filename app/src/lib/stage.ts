/**
 * 演示与自检捷径。
 *
 * 走查询参数，不走 hash——hash 会被浏览器当成页内锚点，路演翻页时容易踩到别的东西。
 * 这些开关不改产品逻辑，只用来：
 *   ?stage=field      跳过开场，直接看时间场（首页）
 *   ?stage=staged     跳过开场，并在首页攒好三件（一句话 / 一段声音 / 一张照片）
 *   ?stage=time       跳过开场，直接进「时间」
 *   ?stage=discover   跳过开场，直接进「发现」
 *   ?stage=understand 跳过开场，直接进「理解」
 *   &volume=1         配合 stage=discover：直接翻开第一册（卷内视图）
 *   &chat=organize    配合 stage=understand：开场白播完后自动问「把上山整理一下」——草稿册回执
 *   &chat=query       配合 stage=understand：自动问「我留意过哪些声音？」——多册回执
 *   &cap=1            关掉过渡、把弹簧直接写进终态，并收起外壳上的浮标（主题开关）
 *   &theme=day|night|system  强制一个主题，盖过 localStorage
 *   &lab=1            打开联调入口（取景框支持拖图进来、多张提示）
 *
 * cap 是给无头截图用的：虚拟时间推不动 JS 弹簧，量到的会是上一帧的值。
 * theme 同理——截图要一次拿全「四屏 × 昼夜」八张，不能靠人去点开关。
 * 真实浏览器里不带这两个参数时，它们什么都不做。
 *
 * lab 是**联调用的**，不是表演用的。照片本来就有两条正式来路——此刻按下的快门，
 * 和从相册选（相册的原始文件保留 EXIF，是照片带真实拍摄时间/坐标的唯一来源）。
 * lab 额外开的是测试便利：拖图进来、多张灌入的提示语，方便桌面/无头环境联调。
 */

export function stageParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('stage')
}

export function hasCap(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('cap')
}

export function themeParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('theme')
}

/** 测试入口开关。见顶部注释：产品里不存在，只在联调与截图时打开。 */
export function hasLab(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('lab')
}
