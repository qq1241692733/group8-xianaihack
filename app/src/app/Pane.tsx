import type { ReactNode } from 'react'

import { useStore, type Pane as PaneId } from './store'

/**
 * 一个 Tab 页。样式来自 global.css 的 .screenPane / .screenPaneOn——
 * 淡出淡入与位移是壳层行为，不属于任何单独页面。
 *
 * 非当前页用 inert 挡掉：只靠 opacity:0 + pointer-events:none 的话，
 * 键盘 Tab 仍然能走进看不见的那一页。 */
export function Pane({
  id,
  className,
  children,
}: {
  id: PaneId
  className?: string
  children: ReactNode
}) {
  const active = useStore((s) => s.pane === id)
  const classes = ['screenPane', active && 'screenPaneOn', className].filter(Boolean).join(' ')

  return (
    <section className={classes} inert={!active}>
      {children}
    </section>
  )
}
