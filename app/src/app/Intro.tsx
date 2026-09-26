import { useState } from 'react'

import styles from './Intro.module.css'

/**
 * 开场。
 *
 * 这里**不触发**「理解」的对话——那是原单文件版最伤的一处 bug：
 * 进 App 就无条件把 AI 全部对话流完，等你真去点「理解」，只剩结尾。
 * 现在对话归理解 Tab 自己管，第一次点开才开始。
 */
export function Intro({ skip }: { skip?: boolean }) {
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(!!skip)

  if (gone) return null

  return (
    <div className={`${styles.intro}${leaving ? ` ${styles.out}` : ''}`}>
      <div className={styles.logo}>此刻</div>
      <div className={styles.slogan}>
        把此刻留下来。
        <br />
        它只替你留住时间。
      </div>
      <button
        type="button"
        className={styles.enter}
        onClick={() => {
          setLeaving(true)
          window.setTimeout(() => setGone(true), 900)
        }}
      >
        进 入
      </button>
    </div>
  )
}
