import { useEffect, useRef, useState } from 'react'

import { useStore } from '@/app/store'
import { useTheme } from '@/app/theme'
import { DotOrb, orbPalette } from '@/features/timefield/dotOrb'
import type { EntryDraft } from '@/features/memory/types'
import { hasCap, hasLab } from '@/lib/stage'

import styles from './capture.module.css'
import { readExifFromBlob } from './exif'
import { analyzeImage, hammingDistance, NEAR_DUP_DISTANCE } from './imageFeatures'
import { paintScene } from './scene'
import { useCamera } from './useCamera'

/** 相机不可用时的画面。它仍然值得被留下——只是它不是一张照片。 */
function SceneCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  const { mode } = useTheme()

  useEffect(() => {
    if (ref.current) paintScene(ref.current, mode)
  }, [mode])

  return <canvas ref={ref} className={styles.vfCanvas} />
}

/**
 * 快门的面就是首页那颗球（同一套网点，只是 70px）。
 * 它轻轻按着一点，像一颗等着被按下的球 —— 与首页那颗是同一个材质，不是另一颗。
 */
function ShutterOrb() {
  const ref = useRef<HTMLCanvasElement>(null)
  const { mode } = useTheme()

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const orb = new DotOrb(cv, { cw: 70, ch: 70, size: 70, gap: 1.42, palette: orbPalette(mode) })
    let raf = 0
    let last = performance.now() / 1000
    const frame = (nowMs: number) => {
      const now = nowMs / 1000
      const dt = Math.min(now - last, 0.05)
      last = now
      orb.setPress(0.1)
      orb.render(dt, now, hasCap())
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  return <canvas ref={ref} className={styles.shutterOrb} aria-hidden="true" />
}

export function PhotoCapture({ onDone }: { onDone: (draft: EntryDraft) => void }) {
  const { videoRef, state, capture } = useCamera(true)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [out, setOut] = useState(false)
  const doneRef = useRef(false)

  const live = state === 'live'

  /* ---------- 从相册选 ----------
   * 与快门并列的第二条来路。相册里的原始文件**保留 EXIF**（拍摄时间 / GPS），
   * 相机路径走 canvas.toBlob 会丢掉它——所以照片带真实时间只有这一条路。
   * 拖着照片进来仍是联调便利（?lab=1），不是产品动作。
   */
  const lab = hasLab()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dropping, setDropping] = useState(false)
  const commitMoment = useStore((s) => s.commitMoment)
  const closeOverlay = useStore((s) => s.closeOverlay)
  const showToast = useStore((s) => s.showToast)
  const vision = useStore((s) => s.visionEnabled)
  const setVision = useStore((s) => s.setVisionEnabled)

  /** 照片的采集侧信号：视觉特征 / dHash / EXIF。任何一步失败都不阻断留下。 */
  async function photoDraft(blob: Blob, source: 'camera' | 'library'): Promise<EntryDraft> {
    const draft: EntryDraft = { kind: 'photo', blob, blobMimeType: blob.type, source }
    try {
      const { visual, hash } = await analyzeImage(blob)
      draft.visual = visual
      draft.imageHash = hash
    } catch {
      // 取像素失败：这张照片只是没有视觉信号，仍照常留下。
    }
    const exif = await readExifFromBlob(blob)
    if (exif) draft.exif = exif
    return draft
  }

  async function takeFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return

    // 一张 = 跟按下快门完全等价，走同一条留下流程。
    if (files.length === 1) {
      if (doneRef.current) return
      doneRef.current = true
      onDone(await photoDraft(files[0], 'library'))
      return
    }

    // 多张：逐张解析，近似重复（dHash）折叠掉；有 EXIF 拍摄时间就按真实时间落，
    // 没有才错开（同一秒落下的照片聚不出「一段日子」）。
    // 一次相册连选**本身就是一件事**，所以整组一次落成一个 moment（共享 momentId）。
    const now = Date.now()
    const hashes: string[] = []
    const drafts: EntryDraft[] = []
    let skipped = 0
    for (const file of files) {
      const draft = await photoDraft(file, 'library')
      const hash = draft.imageHash
      if (hash && hashes.some((h) => hammingDistance(h, hash) <= NEAR_DUP_DISTANCE)) {
        skipped += 1
        continue
      }
      if (hash) hashes.push(hash)
      if (!draft.exif?.takenAt) draft.createdAt = now - (drafts.length + 1) * 7 * 3600 * 1000
      drafts.push(draft)
    }
    if (drafts.length > 0) await commitMoment(drafts)
    showToast(
      skipped > 0
        ? `一次记下 ${drafts.length} 张，跳过 ${skipped} 张重复`
        : `一次记下 ${drafts.length} 张`,
    )
    closeOverlay()
  }

  async function handleShutter() {
    if (busy || doneRef.current) return
    doneRef.current = true
    setBusy(true)
    setFlash(true)

    const blob = await capture()
    setOut(true)

    const draft = blob
      ? await photoDraft(blob, 'camera')
      : ({ kind: 'photo', source: 'camera' } as EntryDraft)
    window.setTimeout(() => onDone(draft), 180)
  }

  return (
    <>
      <div className={styles.scap}>
        <h3>你看见了什么？</h3>
      </div>

      <div
        className={`${styles.viewfinder}${out ? ` ${styles.vfOut}` : ''}${dropping ? ` ${styles.vfDrop}` : ''}`}
        onDragOver={
          lab
            ? (event) => {
                event.preventDefault()
                setDropping(true)
              }
            : undefined
        }
        onDragLeave={lab ? () => setDropping(false) : undefined}
        onDrop={
          lab
            ? (event) => {
                event.preventDefault()
                setDropping(false)
                void takeFiles(event.dataTransfer.files)
              }
            : undefined
        }
      >
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
        <span className={`${styles.vfCorner} ${styles.vfTl}`} />
        <span className={`${styles.vfCorner} ${styles.vfTr}`} />
        <span className={`${styles.vfCorner} ${styles.vfBl}`} />
        <span className={`${styles.vfCorner} ${styles.vfBr}`} />
        <span className={`${styles.vfFocus} ${styles.vfFocusGo}`} />
        <span className={styles.vfMeta}>
          {live ? '不用对准 · 不求清楚' : '没有拿到相机 · 这是画面'}
        </span>
      </div>

      <div className={styles.shutterwrap}>
        <button
          type="button"
          className={styles.shutter}
          onClick={() => void handleShutter()}
          disabled={busy}
          aria-label="按下快门"
        >
          <span className={styles.shutterRing} />
          <ShutterOrb />
        </button>
        <span className={styles.shutterTip}>按下就是看见</span>
      </div>

      <div className={styles.albumRow}>
        <button type="button" className={styles.albumPick} onClick={() => fileRef.current?.click()}>
          从相册选
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className={styles.albumFile}
          onChange={(event) => {
            void takeFiles(event.target.files)
            // 清掉 value，否则同一张图连选两次第二次不触发 change。
            event.target.value = ''
          }}
        />
        <span className={styles.albumHint}>
          {lab ? '选多张 · 也可以直接把照片拖进来' : '选一张，回到它发生的时候'}
        </span>
      </div>

      {/* 唯一让照片离开设备的地方：显式同意、默认关。关闭时一切留在本机，
          照片仍有本地标签（亮度/色温/时段）。 */}
      <div className={styles.visionRow}>
        <button
          type="button"
          className={`${styles.visionToggle}${vision ? ` ${styles.visionOn}` : ''}`}
          onClick={() => setVision(!vision)}
          aria-pressed={vision}
        >
          {vision ? 'AI 看一眼画面 · 已开' : '让 AI 看一眼画面'}
        </button>
        <span className={styles.visionHint}>
          {vision ? '照片会缩小发送到远端做描述，不含位置' : '默认关 · 照片只留在本机'}
        </span>
      </div>

      <div className={`${styles.flash}${flash ? ` ${styles.flashGo}` : ''}`} aria-hidden="true" />
    </>
  )
}
