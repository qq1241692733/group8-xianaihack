import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { Pane } from '@/app/Pane'
import { SettingsMark } from '@/app/icons'
import { useStore, type CaptureIntent } from '@/app/store'
import { useTheme } from '@/app/theme'
import { paintScene } from '@/features/capture/scene'
import type { EntryKind } from '@/features/memory/types'
import styles from '@/features/timefield/home.module.css'
import { createHold, type Hold } from '@/features/timefield/holdController'
import { SatelliteLayer } from '@/features/timefield/SatelliteLayer'
import { useMomentStage } from '@/features/timefield/useMomentStage'
import { usePrefersReducedMotion } from '@/features/timefield/usePrefersReducedMotion'
import { stageParam } from '@/lib/stage'
import { formatStamp } from '@/lib/time'
import { useNow } from '@/lib/useNow'

/**
 * 「此刻」——首页。
 *
 * 一屏只有一颗球、三个入口、一句提示、一个长按。
 * 球悬在上半屏；**三个入口、提示、长按按钮拢在底部的同一簇里**
 * （见 home.module.css 的 .controls）——拇指够得到的地方只有这一簇，
 * 入口不必再往上够到屏幕中间。
 *
 * 交互是**攒出来的**：点文字/图片/声音往球上攒一个元素（落成绕球的小卡），
 * 攒够之后长按「记下此刻」，攒下的全部一次落下、共享一个 momentId——
 * 它们从此是**一件事**，不是一张照片加一句话。
 *
 * 没有「开始专注」、没有完成率、没有连续天数。右上角只收了一枚**设置**——
 * 它不产生记录、不改时间流，改的只是这一屏怎么发光。
 */

/** 三个入口。方向与攒下的小卡一一对应：文字在上、图片在左、声音在右。 */
const ENTRIES: Array<{ kind: EntryKind; label: string; intent: CaptureIntent; icon: ReactNode }> = [
  {
    kind: 'word',
    label: '文字',
    intent: 'word',
    icon: (
      <>
        <path d="M4 6.5h16" />
        <path d="M4 12h16" />
        <path d="M4 17.5h9" />
      </>
    ),
  },
  {
    kind: 'photo',
    label: '图片',
    intent: 'photo',
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
        <circle cx="9" cy="10" r="2" />
        <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
      </>
    ),
  },
  {
    kind: 'sound',
    label: '声音',
    intent: 'sound',
    icon: (
      <>
        <path d="M12 4v16" />
        <path d="M7 8v8" />
        <path d="M17 8v8" />
        <path d="M2.5 11v2" />
        <path d="M21.5 11v2" />
      </>
    ),
  },
]

/** 落下时那把碎片的颜色。昼夜里同一个记录类型是同一个色相，只换明度。 */
const FRAG: Record<EntryKind, { day: string; night: string }> = {
  sound: { day: '#B3A8F2', night: '#A99BF7' },
  photo: { day: '#9DB8F0', night: '#8FB0F5' },
  word: { day: '#8FD6C0', night: '#7FD9BE' },
}

/** 卫星卡飞回球心的时长。落库已完成，这只是让眼睛看完这一下。 */
const FLY_MS = 620

export function MomentScreen() {
  const entries = useStore((s) => s.entries)
  const staged = useStore((s) => s.staged)
  const overlay = useStore((s) => s.overlay)
  const openCapture = useStore((s) => s.openCapture)
  const openOverlay = useStore((s) => s.openOverlay)
  const unstage = useStore((s) => s.unstage)
  const clearStaged = useStore((s) => s.clearStaged)
  const commitStaged = useStore((s) => s.commitStaged)

  const { mode } = useTheme()
  const reduced = usePrefersReducedMotion()
  const now = useNow()

  const orbRef = useRef<HTMLCanvasElement | null>(null)
  const sparkRef = useRef<HTMLCanvasElement | null>(null)
  const rippleRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const fillRef = useRef<HTMLSpanElement | null>(null)
  const hold = useRef<Hold | null>(null)
  const commitRef = useRef<() => void>(() => {})

  const [committing, setCommitting] = useState(false)
  const [justCommitted, setJustCommitted] = useState(false)
  const committingRef = useRef(false)

  const { ready, orbwrapRef, celebrate, nudge } = useMomentStage({
    orbRef,
    sparkRef,
    entries,
    stagedCount: staged.length,
    mode,
    reduced,
  })

  /* ---------- 落下 ----------
   * 落库是同步等到的（一个 Dexie 事务），但**眼睛要看完那一下**：卫星卡飞进球心，
   * 球变密一点，然后才清空攒着的。清空必须等动画走完——URL 一撤，缩略图当场白掉。 */
  const doCommit = useCallback(async () => {
    if (committingRef.current) return
    if (useStore.getState().staged.length === 0) return
    committingRef.current = true
    setCommitting(true)
    setJustCommitted(false)

    const made = await commitStaged()
    let newest = made[0]
    for (const entry of made) if (entry && (!newest || entry.createdAt > newest.createdAt)) newest = entry
    if (newest) {
      celebrate(FRAG[newest.kind][mode])
      const r = rippleRef.current
      if (r) {
        r.classList.remove(styles.rippleGo)
        void r.offsetWidth // 重排一次，让同一个动画能重头再放
        r.classList.add(styles.rippleGo)
      }
    }

    window.setTimeout(() => {
      clearStaged()
      committingRef.current = false
      setCommitting(false)
      setJustCommitted(true)
    }, FLY_MS)
  }, [commitStaged, clearStaged, celebrate, mode])

  useEffect(() => {
    commitRef.current = () => void doCommit()
  }, [doCommit])

  /* ---------- 长按运行时 ---------- */
  useEffect(() => {
    const controller = createHold({
      // 每帧只写 DOM，不 setState —— 逐帧 setState 会把这颗球拖垮。
      onProgress: (p) => {
        const el = fillRef.current
        if (el) el.style.width = `${(p * 100).toFixed(1)}%`
      },
      onCommit: () => commitRef.current(),
    })
    hold.current = controller
    return () => controller.cancel()
  }, [])

  /* ---------- 全局指针 / 键盘 ----------
   * 松手判在 window 上：手指可能移出按钮才松，挂在按钮上会漏掉那一次。
   * 移出判定用 pointermove 看真实坐标，**不用 pointerleave** —— 按下之后浏览器
   * 偶尔会补一个不带坐标的假 leave，照单全收会把长按误取消（demo 上实测踩过）。 */
  useEffect(() => {
    const up = () => hold.current?.end()
    const move = (e: PointerEvent) => {
      const controller = hold.current
      if (!controller?.isHolding()) return
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        controller.end()
      }
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hold.current?.cancel()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('pointermove', move)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('keydown', key)
    }
  }, [])

  /* ---------- 「什么也不留」收起来时，给球一次呼吸 ---------- */
  const prevOverlay = useRef<string | null>(null)
  useEffect(() => {
    if (prevOverlay.current === 'nothing' && overlay === null) nudge()
    prevOverlay.current = overlay
  }, [overlay, nudge])

  /* ---------- 演示捷径：?stage=staged 直接攒三件 ---------- */
  const demoStage = useMemo(() => stageParam(), [])
  const seeded = useRef(false)
  useEffect(() => {
    if (demoStage !== 'staged' || !ready || seeded.current) return
    seeded.current = true
    const stageDraft = useStore.getState().stageDraft
    stageDraft({ kind: 'word', text: '风从湖上过来，很轻。' })
    stageDraft({ kind: 'sound', durationMs: 4200 })
    void (async () => {
      const cv = document.createElement('canvas')
      cv.width = 360
      cv.height = 480
      paintScene(cv, mode)
      const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.8))
      if (blob) stageDraft({ kind: 'photo', blob, blobMimeType: blob.type, source: 'camera' })
    })()
  }, [demoStage, ready, mode])

  /* ---------- 入口计数 ---------- */
  const counts: Record<EntryKind, number> = { word: 0, photo: 0, sound: 0 }
  for (const item of staged) counts[item.kind] += 1

  /* ---------- 长按按钮上的绑定 ---------- */
  const canCommit = staged.length > 0 && !committing
  const onDown = (e: ReactPointerEvent) => {
    if (!canCommit) return
    e.preventDefault()
    hold.current?.start()
  }
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (e.repeat || !canCommit) return
    hold.current?.start()
  }
  const onKeyUp = (e: ReactKeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') hold.current?.end()
  }

  let hint: string
  if (committing) hint = '记下了'
  else if (staged.length === 0)
    hint = justCommitted ? '刚记下一件。再攒一件？' : '这一刻，你想留下什么？'
  else if (staged.length === 1) hint = '还想加点什么？'
  else hint = '长按下面的按钮，记下此刻'

  return (
    <Pane id="moment" className={styles.field}>
      <div className={`${styles.stage}${overlay ? ` ${styles.dimmed}` : ''}`}>
        <canvas ref={sparkRef} aria-hidden="true" className={styles.sparkCanvas} />

        <header className={styles.topbar}>
          <span className={styles.who}>
            <span className={styles.brandRow}>
              <span className={styles.brand}>此刻</span>
              <span className={styles.brandEn}>/ THE TIME</span>
            </span>
            <span className={styles.today}>{formatStamp(now)}</span>
          </span>
          {/* 设置：一屏只留一个发光体，所以它收在右上角一小枚滑杆图标。
              它不产生记录、不改时间流——改的只是这一屏怎么发光。 */}
          <button
            type="button"
            className={styles.settings}
            aria-label="设置"
            onClick={() => openOverlay('settings')}
          >
            <SettingsMark />
          </button>
        </header>

        <div ref={orbwrapRef} className={styles.orbwrap}>
          <canvas
            ref={orbRef}
            aria-hidden="true"
            className={`${styles.orbCanvas}${ready ? ` ${styles.orbCanvasOn}` : ''}`}
          />
          <div ref={rippleRef} className={styles.ripple} />
          <SatelliteLayer items={staged} onRemove={unstage} locked={committing} />
        </div>

        <div className={styles.controls}>
          <div className={styles.entries}>
            {ENTRIES.map((entry) => (
              <button
                key={entry.kind}
                type="button"
                className={`${styles.entry}${counts[entry.kind] > 0 ? ` ${styles.entryFull}` : ''}`}
                onClick={() => {
                  // 又要攒东西了，上一次落下的回执该收了。
                  setJustCommitted(false)
                  openCapture(entry.intent)
                }}
                disabled={committing}
              >
                <span className={styles.ring}>
                  <svg viewBox="0 0 24 24">{entry.icon}</svg>
                </span>
                <span>{entry.label}</span>
                <span className={styles.dotCount}>{counts[entry.kind]}</span>
              </button>
            ))}
          </div>

          <p className={`${styles.hint}${staged.length >= 2 || committing ? ` ${styles.hintOn}` : ''}`}>
            {hint}
          </p>

          <div className={styles.btnwrap}>
            <button
              ref={btnRef}
              type="button"
              className={styles.commit}
              disabled={!canCommit}
              aria-label="长按记下此刻"
              onPointerDown={onDown}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
            >
              <span ref={fillRef} className={styles.commitFill} />
              <span className={styles.commitLabel}>长按 · 记录此刻</span>
            </button>
            <p className={styles.commitNote}>文字、照片、声音，可以一起留下</p>
          </div>
        </div>

        <div className={styles.sr} role="status" aria-live="polite">
          {committing ? '记下了' : staged.length > 0 ? `攒了 ${staged.length} 件` : ''}
        </div>
      </div>
    </Pane>
  )
}
