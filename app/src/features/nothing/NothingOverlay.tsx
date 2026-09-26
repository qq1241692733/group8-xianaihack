import { useEffect } from 'react'

import { Overlay } from '@/app/Overlay'
import { useStore } from '@/app/store'

import styles from './NothingOverlay.module.css'

/** 「什么也不留」停留多久就自己收起来。基准稿是 2600ms。 */
const STAY_MS = 2600

/**
 * 「什么也不留」。
 *
 * 它**不产生记录**：球不变密，球下那句也不变，时间流里不会多一条。
 * 「什么也不留也是一次留」，但留的不是数据 —— 所以这一屏只停一会儿，然后自己走掉，
 * 不留一个「完成」按钮让你去按，也没有倒计时和进度。想走随时可以按取消。
 */
export function NothingOverlay() {
  const open = useStore((s) => s.overlay === 'nothing')
  const closeOverlay = useStore((s) => s.closeOverlay)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => closeOverlay(), STAY_MS)
    return () => window.clearTimeout(timer)
  }, [open, closeOverlay])

  return (
    <Overlay id="nothing" closeLabel="取消" title="什么也不留">
      <div className={styles.blankwrap}>
        <div className={styles.dashed} />
        <div className={styles.bt}>这一次，什么也不留。</div>
        <div className={styles.bs}>不留痕 · 不进时间流</div>
      </div>
    </Overlay>
  )
}
