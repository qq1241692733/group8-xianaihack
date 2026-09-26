import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import type { ThemeMode } from '@/app/theme'
import type { Entry } from '@/features/memory/types'
import { hasCap } from '@/lib/stage'

import { DotOrb, orbPalette } from './dotOrb'
import { levelOf } from './evidence'
import { Sparks } from './sparks'

/**
 * 首页那颗球的运行时。
 *
 * 首页的动作语言换过了：以前是「按住此刻 → 四向刻度 → 选方向」，现在是
 * 「三个入口攒元素 → 长按记下此刻」。手势那条线因此全搬走了（进度与长按判定在
 * holdController，攒下的元素由 MomentScreen 渲染），这里只剩球本身：
 * 建球、呼吸、变密、收下一条时的碎片飞回球心。
 *
 * 两条纪律照旧：
 * ① **每帧不 setState**。rAF 只画球，React 不参与逐帧；
 * ② 随机数 / performance.now() 只在 rAF 里出现，绝不在渲染期（react-hooks/purity）。
 */

/** 攒着东西时球最多临时多密几级。落成之后由真实记录数接管。 */
const STAGE_BOOST = 3

export interface MomentStage {
  /** 画布与球都建好了。 */
  ready: boolean
  orbwrapRef: RefObject<HTMLDivElement | null>
  /** 收下一条：碎片飞回球心 + 球变密。 */
  celebrate: (color?: string) => void
  /** 只给球一次呼吸，不变密 —— 「什么也不留」收起来时用：它不留数据，但也不是没发生。 */
  nudge: () => void
}

export function useMomentStage({
  orbRef,
  sparkRef,
  entries,
  stagedCount,
  mode,
  reduced,
}: {
  orbRef: RefObject<HTMLCanvasElement | null>
  sparkRef: RefObject<HTMLCanvasElement | null>
  entries: readonly Entry[]
  /** 攒着、还没落下的件数。球因此临时变密一点。 */
  stagedCount: number
  mode: ThemeMode
  reduced: boolean
}): MomentStage {
  const [ready, setReady] = useState(false)
  const orbwrapRef = useRef<HTMLDivElement | null>(null)
  const orb = useRef<DotOrb | null>(null)
  const sparks = useRef<Sparks | null>(null)

  const reducedRef = useRef(reduced)
  useEffect(() => {
    reducedRef.current = reduced
  })

  /* ---------- 建球 ---------- */
  useEffect(() => {
    const cv = orbRef.current
    if (!cv) return
    orb.current = new DotOrb(cv, {
      cw: 280,
      ch: 280,
      size: 190,
      gap: 3.1,
      palette: orbPalette(mode),
    })
    if (sparkRef.current) sparks.current = new Sparks(sparkRef.current)
    setReady(true)
    // 只在挂载时建一次；主题变化由下面的 effect 换色板。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- 记录数 + 攒着的件数 → 密度；主题 → 色板 ---------- */
  useEffect(() => {
    orb.current?.setLevel(levelOf(entries) + Math.min(STAGE_BOOST, stagedCount))
  }, [entries, stagedCount])

  useEffect(() => {
    orb.current?.setPalette(orbPalette(mode))
  }, [mode])

  /* ---------- 一帧 ---------- */
  useEffect(() => {
    let raf = 0
    let last = performance.now() / 1000

    const frame = (nowMs: number) => {
      const now = nowMs / 1000
      const dt = Math.min(now - last, 0.05)
      last = now

      // 截图模式（cap）与降级动效：弹簧直接落终态，截到的才和真实浏览一致。
      orb.current?.render(dt, now, reducedRef.current || hasCap())
      sparks.current?.update(dt)
      sparks.current?.draw()

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  /**
   * 收下一条记录。碎片从屏幕中位飞回球心，球变密一点。
   * 起点用屏幕中位而不是采集浮层里那个按钮 —— 浮层此刻已经关掉了，位置也拿不到。
   */
  const celebrate = useCallback((color = '#c7d8f7') => {
    orb.current?.densify()
    const cv = sparkRef.current
    const wrap = orbwrapRef.current
    if (!cv || !wrap) {
      orb.current?.pulse(3.1)
      return
    }
    const cr = cv.getBoundingClientRect()
    const s = cr.width / (cv.offsetWidth || cr.width) || 1
    const wr = wrap.getBoundingClientRect()
    const target = {
      x: (wr.left + wr.width / 2 - cr.left) / s,
      y: (wr.top + wr.height / 2 - cr.top) / s,
    }
    sparks.current?.burst(cv.offsetWidth / 2, cv.offsetHeight / 2, target.x, target.y, color, 68)
    sparks.current!.onArrive = () => {
      sparks.current!.onArrive = null
      orb.current?.pulse(3.1)
    }
  }, [sparkRef])

  const nudge = useCallback(() => {
    orb.current?.pulse(1.5)
  }, [])

  return { ready, orbwrapRef, celebrate, nudge }
}
