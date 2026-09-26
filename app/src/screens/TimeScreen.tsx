import { useMemo, useState } from 'react'

import { KindIcon, PlusMark } from '@/app/icons'
import { Pane } from '@/app/Pane'
import { useStore } from '@/app/store'
import { useTheme } from '@/app/theme'
import { sceneGradient } from '@/features/capture/scene'
import { captionOf, subOf } from '@/features/memory/display'
import { buildTimeline } from '@/features/memory/timeline'
import { useBlobUrl } from '@/features/memory/useBlobUrl'
import { KIND_LABEL, type Entry, type EntryKind } from '@/features/memory/types'
import { formatTimeOfDay } from '@/lib/time'

import styles from './TimeScreen.module.css'

type Filter = 'all' | EntryKind

/**
 * 分类保持原文不变 —— 仍然是 全部 / 声音 / 照片 / 一句话 这四类。
 *
 * 改的只有「图标语言」：标签里原来嵌着 `🎧 📷 ✍️`。emoji 是**不受控的彩色像素**，
 * 每个系统的字形都不一样，而且一次带进红、黄、绿三种色相，直接破坏
 * 「一屏只有一样东西是彩色的」。现在图标由 <KindIcon> 给，与底部导航同一套线性语言。
 */
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'sound', label: '声音' },
  { id: 'photo', label: '照片' },
  { id: 'word', label: '一句话' },
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
  const { mode } = useTheme()
  return (
    <div
      className={styles.thumb}
      style={url ? { backgroundImage: `url(${url})` } : { background: sceneGradient(mode) }}
    />
  )
}

function EntryRow({ entry }: { entry: Entry }) {
  const showToast = useStore((s) => s.showToast)
  const label = KIND_LABEL[entry.kind]
  const cap = captionOf(entry)
  // 类型只在顶行出现一次。captionOf 在没有内容时会退回类型名本身（照片、没转写的
  // 声音），那一遍不算「还有一句话」，不再重复念。
  const hasCap = cap !== label

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
        {/* 种类靠图标形状区分，不上色 —— 时间页没有第二个颜色。 */}
        <div className={styles.media}>
          <KindIcon kind={entry.kind} />
          <span>{label}</span>
          {entry.kind === 'sound' && (
            <span className="wave">
              {waveBars().map((bar) => (
                <i key={bar.key} style={{ height: bar.height }} />
              ))}
            </span>
          )}
        </div>
        {hasCap && <div className={styles.cap}>{cap}</div>}
        {/* 副行只属于声音：「环境声音 · 22 秒」是它的一部分。
            一句话 / 照片再写一遍类型名，只是把顶行说了第二遍。 */}
        {entry.kind === 'sound' && <div className={styles.sub}>{subOf(entry)}</div>}
      </div>
      {entry.kind === 'photo' && <PhotoThumb blobRef={entry.blobRef} />}
    </div>
  )
}

/**
 * 一次落下的几条，收成一条。
 *
 * 它们是**一件事**（共享 momentId），摊成三行就把那件事拆散了。收起来时只露一行：
 * 时间 + 「此刻」+ 里面有哪些种类，「标题」优先用**你自己写的那句**——那件事里唯一
 * 由你命名的部分；没写就退回最新那条的主文案。**不报条数**：种类图标已经说完了。
 */
function MomentRow({ entries }: { entries: Entry[] }) {
  const [open, setOpen] = useState(false)
  const newest = entries[0]
  const word = entries.find((entry) => entry.kind === 'word' && entry.text)
  const title = word?.text ?? (newest ? captionOf(newest) : '')
  const kinds = [...new Set(entries.map((entry) => entry.kind))]

  return (
    <div className={styles.moment}>
      <button
        type="button"
        className={styles.momentHead}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={styles.t}>{newest ? formatTimeOfDay(newest.createdAt) : ''}</span>
        <span className={styles.body}>
          <span className={styles.media}>
            <span className={styles.mTag}>此刻</span>
            {kinds.map((kind) => (
              <KindIcon key={kind} kind={kind} />
            ))}
          </span>
          <span className={styles.cap}>{title}</span>
        </span>
        <svg className={styles.mChevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={styles.momentItems}>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 「时间」——你留下的每一个此刻。
 * 没有总数、没有图表、没有「本月共记录 N 条」。分组只说今天/昨天/某月某日；
 * 一次落下的几条收成一条，点开才看得到里面。
 */
export function TimeScreen() {
  const entries = useStore((s) => s.entries)
  const openOverlay = useStore((s) => s.openOverlay)
  const [filter, setFilter] = useState<Filter>('all')

  const days = useMemo(() => buildTimeline(entries, filter), [entries, filter])

  return (
    <Pane id="time">
      <div className={styles.topRow}>
        <div className={`eyebrow ${styles.eyebrowTop}`}>时间</div>
        <button
          type="button"
          className={styles.addBtn}
          aria-label="记录此刻"
          onClick={() => openOverlay('compose')}
        >
          <PlusMark />
        </button>
      </div>
      <h2 className="paneTitle">时间的触感</h2>
      {/* 只留一句。原来下半句是「它们不组成成绩，只组成你的生活。」——
          它的语法在否定成绩，语用却是把「成绩」这个词请进了这一屏。
          反驳一个概念等于给它一次曝光，而这是时间页最不该出现的词。 */}
      <p className="paneSub">你留下的每一个此刻。</p>

      <div className={styles.chips}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip${filter === item.id ? ' chipOn' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.id !== 'all' && <KindIcon kind={item.id} />}
            {item.label}
          </button>
        ))}
      </div>

      {days.length === 0 ? (
        <div className="empty">
          这里还是空的。
          <br />
          不是需要补齐，只是还没有。
        </div>
      ) : (
        <div className={styles.tl}>
          {days.map((day) => (
            <div key={day.key}>
              <div className={styles.tlDay}>
                <span className={styles.d}>{day.label}</span>
                {/* 没有「N 个此刻」。分组计数也是数字（第一条纪律：不给数字），
                    而且列表本身已经说完了 —— 下面几行摆在那里，不需要再报一遍数。 */}
                <span className={styles.rule} />
              </div>
              {day.nodes.map((node) =>
                node.momentId ? (
                  <MomentRow key={node.key} entries={node.entries} />
                ) : (
                  node.entries[0] && <EntryRow key={node.key} entry={node.entries[0]} />
                ),
              )}
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
