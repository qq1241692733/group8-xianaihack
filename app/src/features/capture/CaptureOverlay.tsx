import { useState } from 'react'

import { Overlay } from '@/app/Overlay'
import { useStore } from '@/app/store'
import { captionOf } from '@/features/memory/display'
import type { Entry, EntryDraft } from '@/features/memory/types'
import { formatDuration, formatTimeOfDay } from '@/lib/time'

import styles from './capture.module.css'
import { PhotoCapture } from './PhotoCapture'
import { SoundCapture } from './SoundCapture'
import { WordCapture } from './WordCapture'

type View = 'home' | 'sound' | 'photo' | 'word' | 'saved'

function savedDetail(entry: Entry): string {
  const time = formatTimeOfDay(entry.createdAt)
  if (entry.kind === 'sound') {
    const length = entry.durationMs ? formatDuration(entry.durationMs) : '环境声音'
    return `🎧 ${time} · ${length}`
  }
  if (entry.kind === 'photo') return `📷 ${time} · ${captionOf(entry)}`
  return `✍️ ${time} · ${captionOf(entry)}`
}

/**
 * 「留下此刻」。
 *
 * 声音 / 照片 / 一句话 三个入口都是真的（真麦克风、真相机），
 * 而「什么都不留下」与它们**同等显眼**——那也是一个完整的答案。
 */
export function CaptureOverlay() {
  const closeOverlay = useStore((s) => s.closeOverlay)
  const showToast = useStore((s) => s.showToast)
  const goPane = useStore((s) => s.goPane)
  const capture = useStore((s) => s.capture)

  const [view, setView] = useState<View>('home')
  const [saved, setSaved] = useState<Entry | null>(null)

  function reset() {
    setView('home')
    setSaved(null)
  }

  function dismiss() {
    closeOverlay()
    reset()
  }

  async function handleDone(draft: EntryDraft) {
    const entry = await capture(draft)
    setSaved(entry)
    setView('saved')
  }

  return (
    <Overlay id="capture" closeLabel="先不留下" onClose={dismiss}>
      {view === 'home' && (
        <>
          <div className="eyebrow">留下此刻</div>
          <h2 className={styles.capTitle}>刚才发生了什么？</h2>
          <p className={styles.capIntro}>
            可以回答。也可以什么都不说。
            <br />
            你留下的方式，本身就是答案。
          </p>

          <div className={styles.capGrid}>
            <button type="button" className={styles.capItem} onClick={() => setView('sound')}>
              <span className={styles.ico}>🎙</span>
              <span className={styles.txt}>
                <b>声音</b>
                <span>这一刻真实存在过的证据</span>
              </span>
              <span className={styles.arw}>›</span>
            </button>
            <button type="button" className={styles.capItem} onClick={() => setView('photo')}>
              <span className={styles.ico}>📷</span>
              <span className={styles.txt}>
                <b>照片</b>
                <span>我看到了什么</span>
              </span>
              <span className={styles.arw}>›</span>
            </button>
            <button type="button" className={styles.capItem} onClick={() => setView('word')}>
              <span className={styles.ico}>✍️</span>
              <span className={styles.txt}>
                <b>一句话</b>
                <span>我想表达什么</span>
              </span>
              <span className={styles.arw}>›</span>
            </button>
          </div>

          <button
            type="button"
            className={`keepBtn ${styles.nothingKeep}`}
            onClick={() => {
              dismiss()
              showToast('那就让它过去。')
            }}
          >
            什么都不留下
          </button>
          <p className={`tiny ${styles.tinyCenter}`}>不留下，也是完整的。</p>
        </>
      )}

      {view === 'sound' && <SoundCapture onDone={handleDone} />}
      {view === 'photo' && <PhotoCapture onDone={handleDone} />}
      {view === 'word' && <WordCapture onDone={handleDone} />}

      {view === 'saved' && saved && (
        <div className={styles.saved}>
          <h2 className={styles.savedTitle}>留下来了。</h2>
          <p className={styles.savedDetail}>{savedDetail(saved)}</p>
          <p className={`tiny ${styles.tinyCenter}`}>
            它不构成任何统计。
            <br />
            只是在时间里多了一条。
          </p>
          <div className={styles.savedActions}>
            <button
              type="button"
              className="keepBtn"
              onClick={() => {
                dismiss()
                goPane('time')
              }}
            >
              去「时间」看看
            </button>
            <button type="button" className="keepBtn keepBtnGhost" onClick={dismiss}>
              回到此刻
            </button>
          </div>
        </div>
      )}
    </Overlay>
  )
}
