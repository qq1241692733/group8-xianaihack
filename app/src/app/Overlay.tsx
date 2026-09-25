import type { ReactNode } from 'react'

import { useStore, type OverlayId } from './store'
import styles from './Overlay.module.css'

/**
 * 全屏浮层外壳：淡入淡出 + 右上角关闭。
 * 浮层内容自己管内部状态（比如「留下此刻」的四个子视图）。
 */
export function Overlay({
  id,
  closeLabel,
  onClose,
  children,
}: {
  id: OverlayId
  closeLabel: string
  onClose?: () => void
  children: ReactNode
}) {
  const open = useStore((s) => s.overlay === id)
  const closeOverlay = useStore((s) => s.closeOverlay)

  return (
    <div className={`${styles.overlay}${open ? ` ${styles.on}` : ''}`} aria-hidden={!open}>
      <button type="button" className={styles.ovClose} onClick={onClose ?? closeOverlay}>
        {closeLabel}
      </button>
      <div className={styles.ovIn}>{children}</div>
    </div>
  )
}
