import { useStore } from './store'
import styles from './Toast.module.css'

/** 只用来解释「刚才发生了什么」，不用来祝贺。 */
export function Toast() {
  const toast = useStore((s) => s.toast)

  return (
    <div className={`${styles.toast}${toast ? ` ${styles.on}` : ''}`} role="status">
      {toast ?? ''}
    </div>
  )
}
