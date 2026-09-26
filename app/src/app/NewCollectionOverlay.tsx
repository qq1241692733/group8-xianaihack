import { useState } from 'react'

import { Overlay } from '@/app/Overlay'
import { KindIcon, PlusMark } from '@/app/icons'
import { useStore } from '@/app/store'
import { MIN_ITEMS } from '@/data/discoveries'
import { captionOf } from '@/features/memory/display'
import { formatTimeOfDay } from '@/lib/time'

import styles from './NewCollectionOverlay.module.css'

/**
 * 新建合集。
 *
 * 发现页右上角那枚 `+` 开的就是这里。一次问两件事：叫什么，装哪几条。
 * 装什么**由你挑**——这是它与守望的分界（守望给一个词，合集给一组记录，
 * 见 data/collections.ts）。所以这一屏的核心不是输入框，是下面那张记录列表。
 *
 * 至少两条才成册——与判据册同一条门槛（MIN_ITEMS 只有一处定义）。
 */
export function NewCollectionOverlay() {
  const entries = useStore((s) => s.entries)
  const addCollection = useStore((s) => s.addCollection)
  const showToast = useStore((s) => s.showToast)
  const closeOverlay = useStore((s) => s.closeOverlay)

  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  async function handleSave() {
    const made = await addCollection(name, picked)
    if (!made) {
      // 两个失败原因：名字空了 / 重名，或挑得不够两条（按钮本该拦住，兜个底）。
      showToast(picked.length < MIN_ITEMS ? `至少挑 ${MIN_ITEMS} 条` : '已经有同名的合集了')
      return
    }
    showToast('已经放到册架上了')
    closeOverlay()
  }

  const ready = name.trim().length > 0 && picked.length >= MIN_ITEMS

  return (
    <Overlay id="newCollection" closeLabel="取消" title="新建合集">
      <div className={styles.wrap}>
        <div className={styles.head}>
          <span className={styles.mark}>
            <PlusMark />
          </span>
          <span className={styles.title}>拢成一册</span>
        </div>
        <p className={styles.say}>起个名字，再从记录里挑几条。挑中的，就是这一册。</p>

        <input
          className={styles.input}
          placeholder="这一册叫什么？"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            // 中文输入法选词时的回车不算提交。
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            if (ready) void handleSave()
          }}
        />

        {entries.length === 0 ? (
          <p className={styles.empty}>还没有留下什么，先去记一条。</p>
        ) : (
          <div className={styles.list}>
            {entries.map((entry) => {
              const on = picked.includes(entry.id)
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`${styles.row}${on ? ` ${styles.rowOn}` : ''}`}
                  aria-pressed={on}
                  onClick={() => toggle(entry.id)}
                >
                  <span className={styles.rowKind}>
                    <KindIcon kind={entry.kind} />
                  </span>
                  <span className={styles.rowText}>{captionOf(entry)}</span>
                  <span className={styles.rowTime}>{formatTimeOfDay(entry.createdAt)}</span>
                  <span className={styles.check} aria-hidden="true">
                    {on ? '●' : '○'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className={styles.foot}>
        <span className={styles.count}>
          {picked.length === 0 ? `挑 ${MIN_ITEMS} 条以上` : `已挑 ${picked.length} 条`}
        </span>
        <button type="button" className={styles.save} onClick={() => void handleSave()} disabled={!ready}>
          保存
        </button>
      </div>
    </Overlay>
  )
}
