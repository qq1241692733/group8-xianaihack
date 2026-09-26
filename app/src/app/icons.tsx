import type { ReactNode } from 'react'

import type { EntryKind } from '@/features/memory/types'

/**
 * 记录种类的线性图标。
 *
 * 与底部导航共用同一套语言：24 格画布、1.6 描边、无填充、颜色一律走 currentColor。
 *
 * 它不是装饰，是 emoji 的替代品。`🎧 📷 ✍️` 由系统 emoji 字体渲染，每个平台长得
 * 都不一样，而且一次带进红、黄、绿三种色相 —— 这一屏只允许一样东西是彩色的（那颗球）。
 * 所以「种类用形状区分，不上色」：三枚图形只差轮廓。
 *
 * 尺寸与描边由容器给（见 TimeScreen.module.css 的 `.chips svg` / `.media svg`），
 * 这里只管形状 —— 与 TabBar 的写法保持一致。
 */
const SHAPES: Record<EntryKind, ReactNode> = {
  sound: <path d="M3.6 12h1.6M8 7.4v9.2M12 4.8v14.4M16 7.4v9.2M20.4 12h-1.6" />,
  photo: (
    <>
      <rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2.8" />
      <circle cx="8.8" cy="10.2" r="1.4" />
      <path d="M4.4 16.8 9.6 12.2l3 2.6 2.8-2.4 4 3.6" />
    </>
  ),
  word: (
    <>
      <path d="M10.2 8.4H6.9c-.8 0-1.5.7-1.5 1.5v2.2c0 .8.7 1.5 1.5 1.5h1.3c0 1.7-1 2.7-2.7 3.2" />
      <path d="M19.2 8.4h-3.3c-.8 0-1.5.7-1.5 1.5v2.2c0 .8.7 1.5 1.5 1.5h1.3c0 1.7-1 2.7-2.7 3.2" />
    </>
  ),
}

export function KindIcon({ kind }: { kind: EntryKind }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {SHAPES[kind]}
    </svg>
  )
}

/**
 * 守望的眼。与 KindIcon 同一套语言：24 格、1.6 描边、无填充、currentColor。
 * 出现在两处——发现页的「正在帮你留意」条与守望册封面的「留意着」标记——
 * 颜色都由所在容器给。
 */
export function EyeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2.5 12c3.4-4.8 7.7-6.7 9.5-6.7s6.1 1.9 9.5 6.7c-3.4 4.8-7.7 6.7-9.5 6.7s-6.1-1.9-9.5-6.7z" />
      <circle cx="12" cy="12" r="2.9" />
    </svg>
  )
}

/**
 * 加号。新建一条记录 / 一个新合集 —— 同一个动作语言，全 App 只此一枚。
 * 与上面几枚同一套：24 格、1.6 描边、无填充、currentColor。
 */
export function PlusMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  )
}

/**
 * 向上的一支箭。「把这句话交出去」——空态那三条示例行与发送键都用它。
 */
export function ArrowUpMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19.5V5M5.6 11.4 12 5l6.4 6.4" />
    </svg>
  )
}

/**
 * 一枚标签。给「记录此刻」里那行「添加标签」用 —— 它标的是**这一刻**，
 * 所以这一个图标管整条记录，不归某一个采集入口。
 */
export function TagMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.4 3.6H5.6a2 2 0 0 0-2 2v5.8c0 .53.21 1.04.59 1.41l6.9 6.9a2 2 0 0 0 2.83 0l5.8-5.8a2 2 0 0 0 0-2.83l-6.9-6.9a2 2 0 0 0-1.42-.58z" />
      <circle cx="8.1" cy="8.1" r="1.25" />
    </svg>
  )
}

/**
 * 设置。两条横杠，上面那条的滑钮在左、下面那条的在右 —— 滑杆的语言，
 * 一眼读得出「可以调」。与上面两个同一套：24 格、1.6 描边、无填充、currentColor。
 *
 * 横杠在滑钮处**断开**：线穿过去会把滑钮读成一枚圈，断一下就成了一颗钮。
 */
export function SettingsMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3.2 9h2.9" />
      <path d="M10.7 9h10.1" />
      <circle cx="8.4" cy="9" r="2.3" />
      <path d="M3.2 15h10.1" />
      <path d="M17.9 15h2.9" />
      <circle cx="15.6" cy="15" r="2.3" />
    </svg>
  )
}
