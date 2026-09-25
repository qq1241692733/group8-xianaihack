import { useState } from 'react'

import { Pane } from '@/app/Pane'
import { useStore } from '@/app/store'
import { captionOf } from '@/features/memory/display'
import { KIND_MARK } from '@/features/memory/types'
import { formatClock, formatDayline, formatSeconds, formatTimeOfDay } from '@/lib/time'
import { useNow } from '@/lib/useNow'

import styles from './MomentScreen.module.css'

const REFUSE_LINES = ['为什么这么着急？', '它不会启动。今天不会。', '好。那就先不做。']

/**
 * 「此刻」——伪装成效率仪表盘。
 *
 * 四个数字里有两个永远是「—」，而且**不是忘了算**：Entry 上根本没有任何
 * 能算出「专注时长」和「完成率」的字段。最大的那个按钮按不动；真正能用的事
 * （留下一刻）被故意做成一整行里最小的字。
 */
export function MomentScreen() {
  const now = useNow()
  const refuseCount = useStore((s) => s.refuseCount)
  const refuse = useStore((s) => s.refuse)
  const openOverlay = useStore((s) => s.openOverlay)
  const captured = useStore((s) => s.captured)

  const [msg, setMsg] = useState('')
  const [jitter, setJitter] = useState<string | undefined>(undefined)
  const [want, setWant] = useState(false)

  const refusing = refuseCount >= REFUSE_LINES.length

  function handleFocusClick() {
    // 它躲开你，而不是启动
    const x = (Math.random() * 7 - 3.5).toFixed(1)
    const y = (Math.random() * 7 - 3.5).toFixed(1)
    setJitter(`translate(${x}px, ${y}px)`)
    window.setTimeout(() => setJitter(undefined), 480)

    setMsg(REFUSE_LINES[Math.min(refuseCount, REFUSE_LINES.length - 1)] ?? '')
    refuse()
  }

  return (
    <Pane id="moment" className={styles.momentPane}>
      <div className={styles.clockWrap}>
        <div className={styles.clock}>
          <span>{formatClock(now)}</span>
          <span className={styles.sec}>{formatSeconds(now)}</span>
        </div>
        <div className={styles.dayline}>{formatDayline(now)}</div>
      </div>

      <div className={styles.dash}>
        <div className={styles.dashHead}>
          <span className={`eyebrow ${styles.eyebrowFlat}`}>今日概览</span>
          <span className={styles.dashNote}>
            {refusing ? '这个工具今天不工作' : `更新于 ${formatClock(now)}`}
          </span>
        </div>

        <div className={styles.dashGrid}>
          <div className={styles.stat}>
            <div className={styles.k}>专 注</div>
            <div className={styles.v}>—</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.k}>完 成 率</div>
            <div className={styles.v}>—</div>
          </div>
          <div className={`${styles.stat} ${styles.statDim}`}>
            <div className={styles.k}>连 续 天 数</div>
            <div className={styles.statNote}>你没有在坚持什么</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.k}>你 拥 有 的</div>
            <div className={styles.v}>
              2<span className={styles.u}>小时</span>47<span className={styles.u}>分</span>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelT}>今 日 任 务</div>
          <div className={styles.panelEmpty}>
            你还没有给自己安排任何事。
            <br />
            这里也不会替你安排。
          </div>
        </div>
      </div>

      <div className={styles.hero}>
        <button
          type="button"
          className={`${styles.focusBtn}${refusing ? ` ${styles.refusing}` : ''}`}
          style={jitter ? { transform: jitter } : undefined}
          onClick={handleFocusClick}
        >
          <span className={styles.zh}>{refusing ? '那就先不做' : '开始专注'}</span>
          <span className={styles.en}>{refusing ? 'Not now' : 'Start Focus'}</span>
        </button>
        <div className={`${styles.refuseMsg}${msg ? ` ${styles.refuseMsgOn}` : ''}`}>{msg}</div>
      </div>

      {captured.length > 0 && (
        <div className={styles.trace}>
          {captured.map((entry) => (
            <div key={entry.id} className={`fadeUp ${styles.traceLine}`}>
              <span>{KIND_MARK[entry.kind]}</span>
              <span>
                {formatTimeOfDay(entry.createdAt)} · {captionOf(entry)}
              </span>
            </div>
          ))}
          <div className={styles.traceNote}>它不计入任何数字。也没有可以完成的事。</div>
        </div>
      )}

      <div className={styles.altRow}>
        <button
          type="button"
          className={styles.altRecord}
          onClick={() => openOverlay('capture')}
        >
          留下一刻
        </button>
        <span className={styles.altSep}>·</span>
        <button type="button" className={styles.altWant} onClick={() => setWant(true)}>
          想做
        </button>
        <span className={styles.altSep}>·</span>
        <button type="button" className={styles.altWant} onClick={() => openOverlay('nothing')}>
          不想做
        </button>
      </div>

      <div className={`${styles.afterWant}${want ? ` ${styles.afterWantOn}` : ''}`}>
        <h2 className={styles.afterWantTitle}>好。</h2>
        <p className={styles.afterWantText}>
          那就去做，不用回来汇报结果。
          <br />
          这里也没有需要打勾的事。
        </p>
        <button type="button" className={`reply replyQuiet ${styles.wantBack}`} onClick={() => setWant(false)}>
          回到此刻
        </button>
      </div>
    </Pane>
  )
}
