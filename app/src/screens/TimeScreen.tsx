import { useMemo, useState } from 'react'

import { Pane } from '@/app/Pane'
import { useStore } from '@/app/store'
import { SCENE_GRADIENT } from '@/features/capture/scene'
import { captionOf, subOf } from '@/features/memory/display'
import { useBlobUrl } from '@/features/memory/useBlobUrl'
import { KIND_LABEL, KIND_MARK, type Entry, type EntryKind } from '@/features/memory/types'
import { dayKey, formatDayLabel, formatTimeOfDay } from '@/lib/time'

import styles from './TimeScreen.module.css'

type Filter = 'all' | EntryKind

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'sound', label: '🎧 声音' },
  { id: 'photo', label: '📷 照片' },
  { id: 'word', label: '✍️ 一句话' },
]

/** 静态波形。它画的是「那一段声音有起伏」，不是「你表现得多好」。 */
function waveBars(count = 11): Array<{ key: number; height: number }> {
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    height: 5 + Math.abs(Math.sin(i * 1.1)) * 15,
  }))
}

function PhotoThumb({ blobRef }: { blobRef: string | undefined }) {
  const url = useBlobUrl(blobRef)
  return (
    <div
      className={styles.thumb}
      style={url ? { backgroundImage: `url(${url})` } : { background: SCENE_GRADIENT }}
    />
  )
}

function EntryRow({ entry }: { entry: Entry }) {
  const showToast = useStore((s) => s.showToast)

  return (
    <div
      className={styles.entry}
      onClick={() => {
        if (entry.kind === 'sound') showToast('正在播放那一刻的声音')
        if (entry.kind === 'photo') showToast('那天的光，还在这里')
        if (entry.kind === 'word') showToast('你当时是这么写的')
      }}
    >
      <div className={styles.t}>{formatTimeOfDay(entry.createdAt)}</div>
      <div className={styles.body}>
        <div className={styles.media}>
          <span>{KIND_MARK[entry.kind]}</span>
          <span>{KIND_LABEL[entry.kind]}</span>
          {entry.kind === 'sound' && (
            <span className="wave">
              {waveBars().map((bar) => (
                <i key={bar.key} style={{ height: bar.height }} />
              ))}
            </span>
          )}
        </div>
        <div className={styles.cap}>{captionOf(entry)}</div>
        <div className={styles.sub}>{subOf(entry)}</div>
        {entry.kind === 'sound' && (
          <div className={styles.miniDots}>
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} className={styles.hit} />
            ))}
          </div>
        )}
      </div>
      {entry.kind === 'photo' && <PhotoThumb blobRef={entry.blobRef} />}
    </div>
  )
}

/**
 * 「时间」——你留下的每一个此刻。
 * 没有总数、没有图表、没有「本月共记录 N 条」。分组只说今天/昨天/某月某日。
 */
export function TimeScreen() {
  const entries = useStore((s) => s.entries)
  const [filter, setFilter] = useState<Filter>('all')

  const groups = useMemo(() => {
    const list = entries.filter((e) => filter === 'all' || e.kind === filter)
    const out: Array<{ key: string; label: string; items: Entry[] }> = []

    // entries 已经是 createdAt 倒序，相邻同一天的并成一组即可
    for (const entry of list) {
      const key = dayKey(entry.createdAt)
      const last = out[out.length - 1]
      if (last && last.key === key) {
        last.items.push(entry)
      } else {
        out.push({ key, label: formatDayLabel(entry.createdAt), items: [entry] })
      }
    }
    return out
  }, [entries, filter])

  return (
    <Pane id="time">
      <div className={`eyebrow ${styles.eyebrowTop}`}>时间</div>
      <h2 className="paneTitle">时间的触感</h2>
      <p className="paneSub">
        你留下的每一个此刻。
        <br />
        它们不组成成绩，只组成你的生活。
      </p>

      <div className={styles.chips}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip${filter === item.id ? ' chipOn' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          这里还是空的。
          <br />
          不是需要补齐，只是还没有。
        </div>
      ) : (
        <div className={styles.tl}>
          {groups.map((group) => (
            <div key={group.key}>
              <div className={styles.tlDay}>
                <span className={styles.d}>{group.label}</span>
                <span className={styles.n}>{group.items.length} 个此刻</span>
                <span className={styles.rule} />
              </div>
              {group.items.map((entry) => (
                <EntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          ))}
          <div className={`empty ${styles.tail}`}>
            没有更早的了。
            <br />
            再往前，是你还没留下的时间。
          </div>
        </div>
      )}
    </Pane>
  )
}
