import { useEffect, useRef, useState } from 'react'

import type { EntryDraft } from '@/features/memory/types'

import styles from './capture.module.css'
import { paintScene } from './scene'
import { useCamera } from './useCamera'

/** 相机不可用时的画面。它仍然值得被留下——只是它不是一张照片。 */
function SceneCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (ref.current) paintScene(ref.current)
  }, [])

  return <canvas ref={ref} className={styles.sceneCanvas} />
}

export function PhotoCapture({ onDone }: { onDone: (draft: EntryDraft) => void }) {
  const { videoRef, state, capture } = useCamera(true)
  const [busy, setBusy] = useState(false)

  const live = state === 'live'

  async function handleShutter() {
    if (busy) return
    setBusy(true)
    const blob = await capture()
    setBusy(false)

    const draft: EntryDraft = { kind: 'photo', sceneHint: '窗外' }
    if (blob) {
      draft.blob = blob
      draft.blobMimeType = blob.type
    }
    onDone(draft)
  }

  return (
    <>
      <div className="eyebrow">照片</div>

      <div className={styles.camView}>
        {/* video 必须一直在 DOM 里：取景流到达时它得已经存在，否则 srcObject 没处可放 */}
        <video
          ref={videoRef}
          className={styles.camMedia}
          style={{ opacity: live ? 1 : 0 }}
          playsInline
          muted
          autoPlay
        />
        {!live && <SceneCanvas />}
        <div className={styles.frame} />
        <div className={styles.camCap}>{live ? '窗外' : '没有拿到相机 · 这是画面'}</div>
      </div>

      <div className={styles.recActions}>
        <button
          type="button"
          className={styles.shutterBtn}
          onClick={() => void handleShutter()}
          disabled={busy}
        >
          <i />
        </button>
        <div className={styles.hint}>按下就留下。不用拍得好看。</div>
      </div>
    </>
  )
}
