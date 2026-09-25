import { useEffect, useMemo, useState } from 'react'

import { Overlay } from '@/app/Overlay'
import { useStore } from '@/app/store'
import { hash01 } from '@/lib/noise'

import styles from './NothingOverlay.module.css'

const AMBIENT_LINES = ['远处有车经过', '空调的声音', '有人在说话', '杯子放下的声音', '有人笑了一下']

/**
 * 环境声是慢慢浮现的，不是一起端上来的——所以要隔 7 到 11 秒来一句。
 * 只在浮层打开时挂载，关掉就整段忘掉：这里不留历史。
 */
function AmbientLines() {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    const picked = [...AMBIENT_LINES].sort(() => Math.random() - 0.5).slice(0, 3)
    const timers = picked.map((line, index) =>
      window.setTimeout(
        () => setLines((prev) => [...prev, line]),
        900 + index * (7000 + Math.random() * 4000),
      ),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  return (
    <div className={styles.ambLines}>
      {lines.map((line, index) => (
        <div key={`${line}-${index}`} className="dItem">
          {line}
        </div>
      ))}
    </div>
  )
}

/**
 * 「什么都不做」。
 *
 * 呼吸圆环不设时长、不会完成——所以这里没有任何计时器，也没有进度弧：
 * 那条进度弧的位置是故意留空的。你什么时候走都可以。
 */
export function NothingOverlay() {
  const open = useStore((s) => s.overlay === 'nothing')
  const openOverlay = useStore((s) => s.openOverlay)

  const bars = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        key: i,
        height: 10 + hash01(i * 1.7) * 24,
        delay: Number((hash01(i * 2.3) * 1.4).toFixed(2)),
        duration: Number((0.9 + hash01(i * 3.1) * 0.9).toFixed(2)),
      })),
    [],
  )

  return (
    <Overlay id="nothing" closeLabel="结束">
      <div className={styles.nothing}>
        <h2 className={styles.lead}>好。</h2>
        <p className={styles.sub}>那就什么都不做。</p>

        <div className={styles.breath}>
          <svg className={styles.ringDraw} viewBox="0 0 250 250">
            {/* 只有轨道，没有进度弧。不设进度，就没有可达成的东西。 */}
            <circle className={styles.tk} cx="125" cy="125" r="115" />
          </svg>
          <div className={`${styles.ring} ${styles.ringInner}`} />
          <div className={`softBreathing ${styles.blob}`} />
          <div className={styles.now}>现 在</div>
        </div>

        <div className={styles.ambient}>
          {bars.map((bar) => (
            <i
              key={bar.key}
              className="ambBar"
              style={{
                height: bar.height,
                animationDelay: `${bar.delay}s`,
                animationDuration: `${bar.duration}s`,
              }}
            />
          ))}
        </div>
        <div className={styles.ambLabel}>没有倒计时。没有进度。想走随时可以走。</div>

        {open && <AmbientLines />}

        <button
          type="button"
          className={`keepBtn keepBtnGhost ${styles.toCapture}`}
          onClick={() => openOverlay('capture')}
        >
          留下这一刻 →
        </button>
      </div>
    </Overlay>
  )
}
