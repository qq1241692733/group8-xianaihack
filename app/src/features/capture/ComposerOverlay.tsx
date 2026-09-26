import { Overlay } from '@/app/Overlay'
import { KindIcon, TagMark } from '@/app/icons'
import { useStore } from '@/app/store'
import { formatStamp } from '@/lib/time'
import { useNow } from '@/lib/useNow'

import styles from './Composer.module.css'

const ATTACH: Array<{ kind: 'photo' | 'sound'; label: string }> = [
  { kind: 'photo', label: '照片' },
  { kind: 'sound', label: '声音' },
]

/**
 * 「记录此刻」——**直接写一条**。
 *
 * 首页那条路是「攒元素 → 长按落下」；这一条是它的另一面：坐下来，一次写完。
 * 两者落进库里是同一件事——共享一个 `momentId` 的整组，所以正文、照片、声音
 * 在这里也是**一件事**的几部分，而不是三条互不相干的记录。
 *
 * 那行标签是**用户自己写的线索**，直接进 `tags.clues`（与 LLM 认出来的同一个字段、
 * 同一个检索面）——所以你今天写下的「马克杯」，以后就能被搜到、被拢成册。
 *
 * 草稿自动保存在这台手机：正文与标签落 localStorage（附件是 Blob，进不去，
 * 只活在这次会话里）。
 */
export function ComposerOverlay() {
  const composer = useStore((s) => s.composer)
  const composerPatch = useStore((s) => s.composerPatch)
  const composerDetach = useStore((s) => s.composerDetach)
  const composerCommit = useStore((s) => s.composerCommit)
  const openCapture = useStore((s) => s.openCapture)
  const closeOverlay = useStore((s) => s.closeOverlay)
  const showToast = useStore((s) => s.showToast)

  const now = useNow()
  const canKeep = composer.text.trim().length > 0 || composer.attachments.length > 0

  return (
    <Overlay id="compose" closeLabel="关闭" title="记录此刻">
      <div className={styles.wrap}>
        <div className={styles.stamp}>{formatStamp(now)}</div>

        <textarea
          className={styles.body}
          value={composer.text}
          onChange={(event) => composerPatch({ text: event.target.value })}
          placeholder="这一刻，你想留下什么？"
          maxLength={500}
        />

        <label className={styles.tagRow}>
          <span className={styles.tagMark}>
            <TagMark />
          </span>
          <input
            className={styles.tagInput}
            value={composer.tags}
            onChange={(event) => composerPatch({ tags: event.target.value })}
            placeholder="添加标签，用逗号分隔"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className={styles.attachRow}>
          {ATTACH.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={styles.attach}
              onClick={() => openCapture(item.kind, 'compose')}
            >
              <KindIcon kind={item.kind} />
              {item.label}
            </button>
          ))}
        </div>

        {composer.attachments.length > 0 && (
          <ul className={styles.attached}>
            {composer.attachments.map((draft, index) => (
              <li key={`${draft.kind}-${index}`} className={styles.attachedItem}>
                <KindIcon kind={draft.kind} />
                <span>{draft.kind === 'photo' ? '一张照片' : '一段声音'}</span>
                <button
                  type="button"
                  className={styles.detach}
                  aria-label="取下"
                  onClick={() => composerDetach(index)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.note}>草稿自动保存在这台手机</p>

        <div className={styles.foot}>
          <button
            type="button"
            className={styles.keep}
            disabled={!canKeep}
            onClick={() => {
              void composerCommit().then((made) => {
                if (!made) return
                closeOverlay()
                showToast('记下了')
              })
            }}
          >
            留下这一刻
          </button>
        </div>
      </div>
    </Overlay>
  )
}
