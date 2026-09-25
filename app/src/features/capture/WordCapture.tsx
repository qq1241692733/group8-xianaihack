import { useState } from 'react'

import { useStore } from '@/app/store'
import type { EntryDraft } from '@/features/memory/types'

import styles from './capture.module.css'

const MAX_LENGTH = 60

/**
 * 「一句话」。
 *
 * 输入内容由 React 渲染，转义是它默认做的事——原单文件版把用户输入直接拼进
 * innerHTML（index.html:911 → 994），一句 `<img src=x onerror=...>` 就能注入。
 * 这里不存在那条路径。
 */
export function WordCapture({ onDone }: { onDone: (draft: EntryDraft) => void }) {
  const showToast = useStore((s) => s.showToast)
  const [value, setValue] = useState('')

  function handleKeep() {
    const text = value.trim()
    if (!text) {
      showToast('写一句，或者什么都不写也可以')
      return
    }
    onDone({ kind: 'word', text })
  }

  return (
    <>
      <div className="eyebrow">一句话</div>
      <h2 className={styles.wordTitle}>想说点什么？</h2>

      <textarea
        className={styles.write}
        placeholder="今天突然不想工作。"
        maxLength={MAX_LENGTH}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus
      />

      <div className={styles.wcount}>
        {value.length} / {MAX_LENGTH}
      </div>

      <button
        type="button"
        className={`keepBtn keepBtnWarm ${styles.wordKeep}`}
        onClick={handleKeep}
      >
        留下来
      </button>
    </>
  )
}
