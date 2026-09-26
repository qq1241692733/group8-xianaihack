import { useEffect, useRef, useState } from 'react'

import { cssVar, useTheme } from '@/app/theme'
import type { EntryDraft } from '@/features/memory/types'

import styles from './capture.module.css'
import { useRecorder } from './useRecorder'

/** 一圈刻度。取 132 是因为 250px 的圆周上再密就糊成一条线了。 */
const TICKS = 132
const SIZE = 250
/** 圆环半径（CSS px）。 */
const R = 76

/**
 * 「听见」。
 *
 * 画的是**一圈声音的圆**，不是一条直线波形 —— 声音是环着的，不是一条待读的进度。
 * 全程**不显示秒数**：时长不是这一屏要说的事，它只进 draft（docs 的第一条纪律）。
 *
 * 起伏来自**真实麦克风**（useRecorder 的 AnalyserNode）。拿不到麦克风时不做假动画：
 * 圆环只留下静态的轮廓，旁边如实说一句，由「取消」离开。
 */
export function SoundCapture({ onDone }: { onDone: (draft: EntryDraft) => void }) {
  const { state, start, stop, cancel, readLevels } = useRecorder()
  const { mode } = useTheme()
  const [out, setOut] = useState(false)
  const doneRef = useRef(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readRef = useRef(readLevels)
  useEffect(() => {
    readRef.current = readLevels
  })

  useEffect(() => {
    void start()
    return () => cancel()
  }, [start, cancel])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    cv.width = Math.round(SIZE * dpr)
    cv.height = Math.round(SIZE * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const ink = cssVar('--d-voice', '#9c8cf6')
    const line = cssVar('--line', 'rgba(238,241,246,0.1)')
    const fill = cssVar('--fill', 'rgba(238,241,246,0.065)')

    const vals = new Float32Array(TICKS)
    const bins = new Uint8Array(256)
    const CX = SIZE / 2
    const CY = SIZE / 2

    let raf = 0
    const frame = () => {
      ctx.clearRect(0, 0, SIZE, SIZE)
      const live = readRef.current(bins)

      // 外圈：声音的范围是有限的，这一圈告诉用户它有边
      ctx.beginPath()
      ctx.arc(CX, CY, R, 0, Math.PI * 2)
      ctx.strokeStyle = line
      ctx.lineWidth = 1
      ctx.stroke()

      for (let i = 0; i < TICKS; i++) {
        let target = 0.04
        if (live) {
          // 高频段基本是底噪，只取前面约 2/3 —— 否则圆环永远在抖
          const bin = Math.floor((i / TICKS) * (bins.length * 0.68))
          target = bins[bin] / 255
        }
        vals[i] += (target - vals[i]) * 0.24

        const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2
        const len = 4 + vals[i] * 34
        ctx.beginPath()
        ctx.moveTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R)
        ctx.lineTo(CX + Math.cos(a) * (R + len), CY + Math.sin(a) * (R + len))
        ctx.strokeStyle = ink
        ctx.globalAlpha = 0.18 + vals[i] * 0.62
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // 中心：一圈安静的核
      ctx.beginPath()
      ctx.arc(CX, CY, 26, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.globalAlpha = 1

      ctx.beginPath()
      ctx.arc(CX, CY, 4.2, 0, Math.PI * 2)
      ctx.fillStyle = ink
      ctx.fill()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // mode 变了要重新读一次令牌（画布拿不到 CSS 变量的实时值）
  }, [mode])

  async function handleStop() {
    if (doneRef.current) return
    doneRef.current = true
    const recording = await stop()

    setOut(true)
    const draft: EntryDraft = { kind: 'sound', sceneHint: '环境声音' }
    if (recording) {
      draft.blob = recording.blob
      draft.blobMimeType = recording.blob.type
      draft.durationMs = recording.durationMs
    }
    window.setTimeout(() => onDone(draft), 140)
  }

  const failed = state === 'error'

  return (
    <>
      <div className={styles.scap}>
        <h3>你听见了什么？</h3>
        <p>{failed ? '没有拿到麦克风' : '不用说话 · 环境声也算'}</p>
      </div>

      <div className={styles.voicewrap}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`${styles.voiceCanvas}${out ? ` ${styles.voiceOut}` : ''}`}
        />
      </div>

      <div className={styles.footbtn}>
        <button
          type="button"
          className={`${styles.bigbtn}${failed ? ` ${styles.bigbtnOff}` : ''}`}
          disabled={failed}
          onClick={() => void handleStop()}
        >
          结束
        </button>
      </div>
    </>
  )
}
