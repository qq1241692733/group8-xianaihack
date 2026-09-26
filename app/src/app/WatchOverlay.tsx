import { useState } from 'react'

import { Overlay } from '@/app/Overlay'
import { EyeMark } from '@/app/icons'
import { useStore } from '@/app/store'

import styles from './WatchOverlay.module.css'

/**
 * 「帮我留意」——守望的设定与管理。
 *
 * 原来它在「理解」页常驻，现在收进发现页的一个浮层：那条「帮我留意」点开就是这里。
 * 理由与设置同一个：**设定是偶尔做的事，不该占着一屏**。
 *
 * 三条边界照旧落在界面上：
 *  - 设定动作是一句话（下面的输入框），不是表单；
 *  - 撤回无痕——删掉一个词，没有「你删掉了」的回执，相关册自然散去；
 *  - 它不提醒你，也不催你。只在你留下的时候，替你聚起来。
 */
export function WatchOverlay() {
  const watches = useStore((s) => s.watches)
  const addWatch = useStore((s) => s.addWatch)
  const removeWatch = useStore((s) => s.removeWatch)
  const showToast = useStore((s) => s.showToast)
  const [draft, setDraft] = useState('')

  async function handleAdd() {
    const word = draft.trim()
    if (!word) return
    const before = useStore.getState().watches.length
    await addWatch(word)
    // 同一个词不立两遍（watches.ts 去重）——如实说一句，而不是让按钮看起来失灵。
    if (useStore.getState().watches.length === before) showToast('已经在留意这个了')
    setDraft('')
  }

  return (
    <Overlay id="watches" closeLabel="关闭" title="帮我留意">
      <div className={styles.wrap}>
        <div className={styles.head}>
          <span className={styles.mark}>
            <EyeMark />
          </span>
          <span className={styles.title}>我在替你留意</span>
        </div>
        <p className={styles.say}>它不提醒你，也不催你。只在你留下的时候，替你聚起来。</p>

        {watches.length > 0 && (
          <div className={styles.words}>
            {watches.map((watch) => (
              <span key={watch.id} className={styles.word}>
                {watch.word}
                <button
                  type="button"
                  className={styles.del}
                  aria-label={`不再留意${watch.word}`}
                  onClick={() => void removeWatch(watch.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className={styles.add}>
          <input
            className={styles.input}
            placeholder="想让我总替你留意什么？"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // 中文输入法选词时的回车不算提交。
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
              event.preventDefault()
              void handleAdd()
            }}
          />
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => void handleAdd()}
            disabled={!draft.trim()}
          >
            留意
          </button>
        </div>
      </div>
    </Overlay>
  )
}
