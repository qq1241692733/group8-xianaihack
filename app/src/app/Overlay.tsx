import type { ReactNode } from 'react'

import { useStore, type OverlayId } from './store'
import styles from './Overlay.module.css'

/**
 * 全屏浮层外壳：淡入淡出 + 一行动作头（取消 · 标题 · 占位）。
 *
 * 头的形状照基准稿 index_demo_light_v2.html 的 `.sbar2`：取消在左、标题居中。
 * 内容自己管内部状态（比如「听见」那一屏的录音）。
 */
export function Overlay({
  id,
  closeLabel,
  title,
  onClose,
  children,
}: {
  id: OverlayId
  closeLabel: string
  /** 居中的那行小字。不给就只留左侧的取消。 */
  title?: string
  onClose?: () => void
  children: ReactNode
}) {
  const open = useStore((s) => s.overlay === id)
  const closeOverlay = useStore((s) => s.closeOverlay)

  return (
    <div className={`${styles.overlay}${open ? ` ${styles.on}` : ''}`} aria-hidden={!open}>
      <div className={styles.ovBar}>
        <button type="button" className={styles.ovClose} onClick={onClose ?? closeOverlay}>
          {closeLabel}
        </button>
        <span className={styles.ovTitle}>{title ?? ''}</span>
        <span className={styles.ovGap} />
      </div>
      <div className={styles.ovIn}>{children}</div>
    </div>
  )
}
