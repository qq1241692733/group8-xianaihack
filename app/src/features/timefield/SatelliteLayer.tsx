import type { CSSProperties } from 'react'

import type { StagedItem } from '@/app/store'
import type { EntryKind } from '@/features/memory/types'

import styles from './home.module.css'

/**
 * 攒下的元素：绕球浮在三个方向上的小卡。
 *
 * 三种元素各有各的方向（文字在上、图片在左、声音在右）——与首页那三个入口一一对应，
 * 所以攒了什么一眼看得出来。同一方向攒了多张时，沿**垂直方向**以 0 为中心错开（FAN）。
 *
 * 距离是贴着球缘定的：球最满时半径约 105，所以左右两张会轻轻压在球的边上——
 * 这是有意的（demo 里也是），卡在球上面浮着，不压在中间的入口上。
 */

const DIR: Record<EntryKind, { x: number; y: number }> = {
  word: { x: 0, y: -1 },
  photo: { x: -1, y: 0 },
  sound: { x: 1, y: 0 },
}

/** 球心到卡心的距离。文字卡在上方可以远一点，左右两张让开到球缘外。 */
const DIST: Record<EntryKind, number> = { word: 150, photo: 112, sound: 112 }
/** 同一方向多张时沿垂直方向错开的间距。 */
const FAN = 42

/** 声音卡的波形：由 id 决定的确定性高度，同一件东西每次画出来一样。 */
function bars(seed: string): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const out: number[] = []
  for (let i = 0; i < 11; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    out.push(24 + Math.abs(h % 76))
  }
  return out
}

function inner(item: StagedItem) {
  if (item.kind === 'word') return <div className={styles.satWord}>{item.preview.text}</div>
  if (item.kind === 'photo') {
    return (
      <div className={styles.satPhoto}>
        {item.preview.url ? <img src={item.preview.url} alt="" /> : null}
      </div>
    )
  }
  return (
    <div className={styles.satSound}>
      <div className={styles.satBars}>
        {bars(item.id).map((h, i) => (
          <i key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className={styles.satDur}>{((item.preview.durationMs ?? 0) / 1000).toFixed(1)}″</div>
    </div>
  )
}

export function SatelliteLayer({
  items,
  onRemove,
  locked,
}: {
  items: readonly StagedItem[]
  onRemove: (id: string) => void
  /** 正在落下：卡在飞回球心，此时点不动。 */
  locked: boolean
}) {
  // 计数与「第几个槽位」分开——复用一个对象会让徽章翻倍（demo 上踩过）。
  const counts: Record<EntryKind, number> = { word: 0, photo: 0, sound: 0 }
  for (const item of items) counts[item.kind] += 1
  const slots: Record<EntryKind, number> = { word: 0, photo: 0, sound: 0 }

  return (
    <div className={styles.sats}>
      {items.map((item) => {
        const dir = DIR[item.kind]
        const slot = slots[item.kind]++
        const perp = dir.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 }
        const off = (slot - (counts[item.kind] - 1) / 2) * FAN
        const px = dir.x * DIST[item.kind] + perp.x * off
        const py = dir.y * DIST[item.kind] + perp.y * off
        const rest = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`

        return (
          <div
            key={item.id}
            className={`${styles.sat}${locked ? ` ${styles.satOut}` : ''}`}
            style={{ '--rest': rest, animationDelay: `${slot * 40}ms` } as CSSProperties}
          >
            <button
              type="button"
              className={styles.satCard}
              onClick={() => onRemove(item.id)}
              disabled={locked}
              aria-label="取下来"
            >
              {inner(item)}
            </button>
            {/* × 挂在卡片**外面**：.satCard 为圆角裁了 overflow，放在里面
                只会露出四分之一的半枚徽章（2026-09-27 修）。它仍是装饰——
                点整张卡都是取下来，所以不吃指针。 */}
            <span className={styles.satX} aria-hidden="true">
              ×
            </span>
          </div>
        )
      })}
    </div>
  )
}
