import { useEffect, useMemo } from 'react'

import type { EntryDraft } from '@/features/memory/types'
import { hash01 } from '@/lib/noise'
import { formatElapsed } from '@/lib/time'

import styles from './capture.module.css'
import { useRecorder } from './useRecorder'

/** 走到第 N 秒时，画面替你「听见」一样东西。 */
const DETECTIONS: Array<[atSecond: number, line: string]> = [
  [3, '咖啡机的声音'],
  [7, '旁边有人笑了一下'],
  [12, '杯子碰到桌子的声音'],
]

export function SoundCapture({ onDone }: { onDone: (draft: EntryDraft) => void }) {
  const { state, elapsedMs, start, stop, cancel } = useRecorder()

  useEffect(() => {
    void start()
    return () => cancel()
  }, [start, cancel])

  const seconds = Math.floor(elapsedMs / 1000)

  // 由时间直接推导，不再用 state 记「已经浮现过哪几句」——
  // 那样要在 effect 里改 state，多一轮渲染，还容易漏。
  const detected = useMemo(
    () => DETECTIONS.filter(([atSecond]) => seconds >= atSecond).map(([, line]) => line),
    [seconds],
  )

  const bars = useMemo(
    () =>
      Array.from({ length: 38 }, (_, i) => ({
        key: i,
        height: 8 + Math.abs(Math.sin(i * 0.7)) * 70 + hash01(i * 5.3) * 16,
        duration: Number((0.5 + hash01(i * 7.1) * 0.6).toFixed(2)),
        delay: Number((hash01(i * 11.3) * 0.5).toFixed(2)),
      })),
    [],
  )

  async function handleStop() {
    const recording = await stop()

    const draft: EntryDraft = { kind: 'sound', sceneHint: '环境声音' }
    if (recording) {
      draft.blob = recording.blob
      draft.blobMimeType = recording.blob.type
      draft.durationMs = recording.durationMs
    }
    onDone(draft)
  }

  const failed = state === 'error'

  return (
    <div className={styles.rec}>
      <div className="eyebrow">声音</div>

      <div className={styles.bigWave}>
        {bars.map((bar) => (
          <i
            key={bar.key}
            style={{
              height: bar.height,
              animation: `amb ${bar.duration}s ease-in-out infinite alternate`,
              animationDelay: `${bar.delay}s`,
            }}
          />
        ))}
      </div>

      <div className={styles.timer}>{formatElapsed(elapsedMs)}</div>
      <div className={styles.hint}>
        {failed ? '没有拿到麦克风。可以换一种方式留下。' : '不用说话。让它自己响着就行。'}
      </div>

      <div className={styles.detected}>
        {detected.map((line) => (
          <div key={line} className="dItem">
            {line}
          </div>
        ))}
      </div>

      <div className={styles.recActions}>
        <button
          type="button"
          className={styles.stopBtn}
          onClick={() => void handleStop()}
          disabled={failed}
        >
          停
        </button>
      </div>
    </div>
  )
}
