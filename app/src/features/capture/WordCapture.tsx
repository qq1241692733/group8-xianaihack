import { useRef, useState } from 'react'

import type { EntryDraft } from '@/features/memory/types'

import styles from './capture.module.css'

const MAX_LENGTH = 60

/**
 * 「写下」。
 *
 * 输入内容由 React 渲染，转义是它默认做的事——原单文件版把用户输入直接拼进
 * innerHTML（index.html:911 → 994），一句 `<img src=x onerror=...>` 就能注入。
 * 这里不存在那条路径。
 *
 * 交出去之前先让那句话自己淡掉、虚掉：它是被写下了，不是被删掉了。
 */
export function WordCapture({ onDone }: { onDone: (draft: EntryDraft) => void }) {
  const [value, setValue] = useState('')
  const [out, setOut] = useState(false)
  const doneRef = useRef(false)

  const text = value.trim()
  const canKeep = text.length > 0

  function handleKeep() {
    if (!canKeep || doneRef.current) return
    doneRef.current = true
    setOut(true)
    window.setTimeout(() => onDone({ kind: 'word', text }), 140)
  }

  return (
    <>
      <div className={styles.scap}>
        <h3>此刻，你想留下一句什么？</h3>
      </div>

      <div className={styles.paper}>
        <textarea
          className={`${styles.writeTa}${out ? ` ${styles.taOut}` : ''}`}
          placeholder="一句话就好"
          rows={4}
          maxLength={MAX_LENGTH}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.wc}>{canKeep ? `${text.length} 字` : ''}</div>

      <div className={styles.footbtn}>
        <button
          type="button"
          className={`${styles.bigbtn}${canKeep ? '' : ` ${styles.bigbtnOff}`}`}
          disabled={!canKeep}
          onClick={handleKeep}
        >
          留下
        </button>
      </div>
    </>
  )
}
