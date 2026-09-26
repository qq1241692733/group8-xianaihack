import { useEffect, useMemo, useState } from 'react'

import { Pane } from '@/app/Pane'
import { EyeMark, KindIcon, PlusMark } from '@/app/icons'
import { useStore } from '@/app/store'
import { useTheme } from '@/app/theme'
import {
  buildDiscoveries,
  formatEra,
  formatSpan,
  volumeOf,
  type DiscoveryCard,
} from '@/data/discoveries'
import { sceneGradient } from '@/features/capture/scene'
import { captionOf } from '@/features/memory/display'
import { useBlobUrl } from '@/features/memory/useBlobUrl'
import { KIND_LABEL, type Entry } from '@/features/memory/types'
import { formatDuration, formatTimeOfDay } from '@/lib/time'

import styles from './DiscoverScreen.module.css'

/**
 * 「发现」= 档案（docs/23）。
 *
 * ── v5：从「轴 + 节点」改成「册架 → 卷内」──────────────────────
 * 上一版的结构是一条竖轴挂节点——和时间页的纵向流仍然是一个族，而且
 * 「卡片」说的是并列条目，「档案」说的是收在一起的集合。
 * 现在：**册架**稀排大封面（一屏约一册半），**卷内**按类型成段。
 * 与时间页的分界不再是皮，是节奏：时间页密、小、匀；册架疏、大、不匀。
 *
 * 册的内容不在这里存：判据（discoveries.ts）从真实记录里现算，
 * 封面材质 = 主导类型，卷内段序固定（声音 → 照片 → 一句话，从证据到人）。
 * 单类型册不显示段头——全册只有声音时，唯一的段不必自报家门。
 * ───────────────────────────────────────────────────────────
 */

/** 封面波形地平线。固定几何——每次渲染都变形的波形不是证据，是噪音。 */
const HORIZON = [
  30, 62, 40, 78, 48, 92, 44, 68, 52, 84, 42, 58, 34, 72, 46, 62, 38, 80, 50, 66, 36, 74, 44, 56,
]

/** 卷内声纹的固定几何。 */
const WAVE = [32, 64, 44, 88, 52, 100, 38, 74, 46, 62, 34, 82, 50, 68, 36]

/* ---------- 卷内的一段 ---------- */

function SoundRow({ entry }: { entry: Entry }) {
  return (
    <div className={styles.soundRow}>
      <span className={styles.soundTime}>{formatTimeOfDay(entry.createdAt)}</span>
      <span className={styles.soundWave} aria-hidden="true">
        {WAVE.map((h, i) => (
          <i key={i} style={{ height: `${h}%` }} />
        ))}
      </span>
      <span className={styles.soundMeta}>
        {entry.durationMs ? formatDuration(entry.durationMs) : entry.tags.scene || '一段环境声'}
      </span>
    </div>
  )
}

function PhotoTile({ entry, gradient }: { entry: Entry; gradient: string }) {
  const url = useBlobUrl(entry.blobRef)
  // 没有真实 blob 的照片（种子 / 丢失的 blob）不画空心框——
  // 降级画面沿用 scene.ts 的窗外语言，那是「一张照片」在这个产品里的样子。
  return (
    <figure
      className={styles.photoTile}
      style={url ? { backgroundImage: `url(${url})` } : { backgroundImage: gradient }}
    >
      {entry.tags.scene && <figcaption>{entry.tags.scene}</figcaption>}
    </figure>
  )
}

function WordQuote({ entry }: { entry: Entry }) {
  return (
    <blockquote className={styles.quote}>
      <p>{captionOf(entry)}</p>
      <cite>{formatTimeOfDay(entry.createdAt)}</cite>
    </blockquote>
  )
}

/* ---------- 卷内 ---------- */

function VolumeView({
  card,
  kept,
  onBack,
  onKeep,
  onDissolve,
}: {
  card: DiscoveryCard
  kept: boolean
  onBack: () => void
  onKeep: () => void
  onDissolve: () => void
}) {
  const { mode } = useTheme()
  const volume = volumeOf(card)
  // 照片条的降级渐变要跟主题走——纸面上的深色块会读成一个洞（docs/18）。
  const gradient = sceneGradient(mode)

  return (
    <Pane id="discover">
      <div className={styles.topRow}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← 册架
        </button>
        <span className={styles.span}>{formatSpan(card)}</span>
      </div>

      <div className={`eyebrow ${styles.eyebrowFlat}`}>{formatEra(card)}</div>
      <h2 className={`paneTitle ${styles.volumeTitle}`}>{card.title}</h2>
      <p className={styles.provenance}>这一册，是从你留下的记录里长出来的。</p>

      <div className={styles.sections}>
        {volume.sections.map((section) => (
          <section key={section.kind} className={styles.section}>
            {/* 单类型册不显示段头：唯一的段不必自报家门（docs/23 §二）。 */}
            {!volume.single && (
              <div className={styles.sectionHead}>
                <KindIcon kind={section.kind} />
                {KIND_LABEL[section.kind]}
              </div>
            )}

            {section.kind === 'sound' &&
              section.items.map((entry) => <SoundRow key={entry.id} entry={entry} />)}

            {section.kind === 'photo' && (
              <div className={styles.photoStrip}>
                {section.items.map((entry) => (
                  <PhotoTile key={entry.id} entry={entry} gradient={gradient} />
                ))}
              </div>
            )}

            {section.kind === 'word' &&
              section.items.map((entry) => <WordQuote key={entry.id} entry={entry} />)}
          </section>
        ))}
      </div>

      <div className={styles.volumeActs}>
        <button
          type="button"
          className={`${styles.act}${kept ? ` ${styles.actOn}` : ''}`}
          onClick={onKeep}
          aria-pressed={kept}
        >
          {kept ? '已保留' : '保留'}
        </button>
        {/* 守望的册属于守望词，不属于这一页——要散，去发现页那条「帮我留意」撤那个词。 */}
        {card.origin !== 'watch' && (
          <button type="button" className={styles.act} onClick={onDissolve}>
            {card.origin === 'custom' ? '删除' : '解散'}
          </button>
        )}
      </div>
    </Pane>
  )
}

/* ---------- 册架的封面 ---------- */

function FilmTile({ entry, gradient }: { entry: Entry; gradient: string }) {
  const url = useBlobUrl(entry.blobRef)
  return (
    <span
      className={styles.filmTile}
      style={url ? { backgroundImage: `url(${url})` } : { backgroundImage: gradient }}
    />
  )
}

function Cover({ card, kept, onOpen }: { card: DiscoveryCard; kept: boolean; onOpen: () => void }) {
  const { mode } = useTheme()
  const volume = volumeOf(card)
  const gradient = sceneGradient(mode)

  return (
    <button
      type="button"
      className={`${styles.cover}${kept ? ` ${styles.coverKept}` : ''}`}
      onClick={onOpen}
    >
      <span className={styles.coverTop}>
        <span className={styles.coverWhen}>{formatEra(card)}</span>
        {card.origin === 'watch' && (
          <span className={styles.watchMark}>
            <EyeMark />
            留意着
          </span>
        )}
        {card.origin === 'judge' && <span className={styles.sampleMark}>示例连接</span>}
        {card.origin === 'custom' && <span className={styles.sampleMark}>自己拢的</span>}
      </span>

      {volume.lead === 'sound' && (
        <span className={styles.horizon} aria-hidden="true">
          {HORIZON.map((h, i) => (
            <i key={i} style={{ height: `${h}%` }} />
          ))}
        </span>
      )}

      {volume.lead === 'photo' && (
        <span className={styles.filmStrip} aria-hidden="true">
          {card.items
            .filter((e) => e.kind === 'photo')
            .slice(0, 4)
            .map((entry) => (
              <FilmTile key={entry.id} entry={entry} gradient={gradient} />
            ))}
        </span>
      )}

      {volume.lead === 'word' && (
        <p className={styles.coverWord}>
          {captionOf(card.items.find((e) => e.kind === 'word') ?? card.items[0])}
        </p>
      )}

      <span className={styles.coverName}>{card.title}</span>
      <span className={styles.coverNote}>{card.note}</span>
    </button>
  )
}

/* ---------- 页 ---------- */

export function DiscoverScreen() {
  const entries = useStore((s) => s.entries)
  const promoted = useStore((s) => s.discoveries)
  const keptIds = useStore((s) => s.keptDiscoveries)
  const dissolvedIds = useStore((s) => s.dissolvedDiscoveries)
  const watches = useStore((s) => s.watches)
  const collections = useStore((s) => s.collections)
  const removeCollection = useStore((s) => s.removeCollection)
  const keepDiscovery = useStore((s) => s.keepDiscovery)
  const dissolveDiscovery = useStore((s) => s.dissolveDiscovery)
  const promotedId = useStore((s) => s.promotedId)
  const clearPromoted = useStore((s) => s.clearPromoted)
  const showToast = useStore((s) => s.showToast)
  const openOverlay = useStore((s) => s.openOverlay)

  // picked 三态：null = 还没有手动选择；'closed' = 用户从卷内返回过；册 id = 打开的那册。
  // 演示捷径（stage.ts 同族）：&volume=1 时「没有手动选择」就指向第一册——
  // 路演翻页与无头截图都要一步到位。用渲染期派生而不是 effect setState（react-hooks 纪律）。
  const volumeShortcut =
    useMemo(
      () =>
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).has('volume'),
      [],
    )
  const [picked, setPicked] = useState<string | null | 'closed'>(null)
  // 对话里「翻开来」的落点（docs/23 §三）：带着 focusId 进来就直接翻开那一册。
  const focusId = useStore((s) => s.volumeFocusId)
  const clearVolumeFocus = useStore((s) => s.clearVolumeFocus)
  const closeVolume = () => {
    setPicked('closed')
    clearVolumeFocus()
  }

  const cards = useMemo(() => {
    const base = buildDiscoveries(entries, watches, collections)
    const merged = [...promoted, ...base.filter((c) => !promoted.some((p) => p.id === c.id))]
    const alive = merged.filter((c) => !dissolvedIds.includes(c.id))
    // 已保留的固定在前，其余保持原顺序（守望册本来就在前）
    return [
      ...alive.filter((c) => keptIds.includes(c.id)),
      ...alive.filter((c) => !keptIds.includes(c.id)),
    ]
  }, [entries, promoted, keptIds, dissolvedIds, watches, collections])

  // 册可能已经不在（守望撤回 / 解散）——卷内视图随之合上，不留一具尸体。
  const openId =
    picked === null
      ? (focusId ?? (volumeShortcut ? (cards[0]?.id ?? null) : null))
      : picked === 'closed'
        ? null
        : picked
  const open = cards.find((c) => c.id === openId) ?? null

  // 高亮只亮一次，四秒后归于安静
  useEffect(() => {
    if (!promotedId) return
    const timer = window.setTimeout(clearPromoted, 4000)
    return () => window.clearTimeout(timer)
  }, [promotedId, clearPromoted])

  if (open) {
    return (
      <VolumeView
        card={open}
        kept={keptIds.includes(open.id)}
        onBack={closeVolume}
        onKeep={() => keepDiscovery(open.id)}
        onDissolve={() => {
          // 自建合集是库里的实体，删它 = 从库里删；判据册只是聚合视图，解散即可。
          if (open.origin === 'custom' && open.collectionId) {
            void removeCollection(open.collectionId)
            showToast('合集删掉了，记录都在')
          } else {
            dissolveDiscovery(open.id)
            showToast('散回时间页了，记录都在')
          }
          setPicked('closed')
        }}
      />
    )
  }

  return (
    <Pane id="discover">
      <div className={styles.topRow}>
        <h2 className={`paneTitle ${styles.titleFlat}`}>发现</h2>
        <div className={styles.topActions}>
          {/* 「示例数据」：一个普通按钮，不带箭头 —— 它不承诺跳转，只是说明
              这批是演示数据（17 号文档的硬判断：没有目的地就不给 ↗）。 */}
          <button
            type="button"
            className={styles.sample}
            onClick={() => showToast('这是演示数据，还没有云同步')}
          >
            示例数据
          </button>
          <button
            type="button"
            className={styles.addBtn}
            aria-label="新建合集"
            onClick={() => openOverlay('newCollection')}
          >
            <PlusMark />
          </button>
        </div>
      </div>

      <p className="paneSub">零散的记录，慢慢有了联系。</p>

      {/* 「正在帮你留意」条：守望在发现页的常驻显影。**点开就是它的设定与管理**
          （原来是跳去理解页改——设定是偶尔做的事，不该占着一屏）。 */}
      <button type="button" className={styles.watchStrip} onClick={() => openOverlay('watches')}>
        <span className={styles.watchStripMark}>
          <EyeMark />
        </span>
        {watches.length > 0 ? (
          <span className={styles.watchStripText}>
            正在帮你留意：{watches.map((w) => w.word).join(' · ')}
          </span>
        ) : (
          <span className={styles.watchStripText}>还没有在留意的</span>
        )}
        <span className={styles.watchStripHint}>设置</span>
      </button>

      {cards.length === 0 ? (
        <div className="empty">
          还没有长出什么。
          <br />
          不是需要补齐，只是还没有。
        </div>
      ) : (
        <>
          <div className={styles.shelf}>
            {cards.map((card, i) => (
              <div
                key={card.id}
                className={styles.slot}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <Cover
                  card={card}
                  kept={keptIds.includes(card.id)}
                  onOpen={() => setPicked(card.id)}
                />
              </div>
            ))}
          </div>
          <div className={`empty ${styles.tail}`}>
            就这些了。
            <br />
            剩下的，要等你多留一些。
          </div>
        </>
      )}
    </Pane>
  )
}
