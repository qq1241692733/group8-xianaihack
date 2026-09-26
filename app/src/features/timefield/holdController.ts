/**
 * 长按「记下此刻」的判定核心。
 *
 * 为什么不是一句 `onPointerDown → setTimeout`：台前时长按要看得见进度，后台（切走的标签页、
 * 无头截图）里 rAF 与 timer **都会被节流**，只靠任何一条都可能跑不到头。所以完成判定有三条
 * 独立的路，谁先到算谁：
 *
 *   ① rAF 把进度画出来，跑到 1 → 提交；
 *   ② `setTimeout(holdMs)` 兜底 → 提交（rAF 被冻结时它还在跑）；
 *   ③ 松手那一刻用**墙钟**（`now() - startAt >= holdMs`）再判一次 → 提交（rAF 和 timer 都被
 *      冻结时，只有墙钟还说得出「其实按够了」）。
 *
 * 三条路都走同一个收尾，重复触发是幂等的（`holding` 一落就没有第二次）。
 *
 * 抽成独立模块是为了能测：时钟 / rAF / 定时器都可注入（`options.env`），
 * 于是「松手太早要取消」「rAF 被冻结但墙钟按够了仍提交」都能用假时钟钉住。
 *
 * 注意 DOM 那层的一个坑：不要用 `pointerleave` 判断移出——按下之后浏览器偶尔会补一个
 * **不带坐标**的假 leave，照单全收会把长按误取消。要用 `pointermove` 看真实坐标。
 */

export const HOLD_MS = 900

interface HoldEnv {
  now(): number
  raf(cb: () => void): number
  caf(id: number): void
  setTimeout(cb: () => void, ms: number): number
  clearTimeout(id: number): void
}

const browserEnv: HoldEnv = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  caf: (id) => cancelAnimationFrame(id),
  setTimeout: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeout: (id) => window.clearTimeout(id),
}

export interface HoldHandlers {
  /** 每帧的进度 0..1。写进 ref / 直接改 DOM，**不要** setState。收尾时收到 0。 */
  onProgress(p: number): void
  /** 按够了。 */
  onCommit(): void
  /** 松手太早 / 显式取消。 */
  onCancel?(): void
}

export interface Hold {
  start(): void
  /** 松手：按够了就提交，不够就取消。 */
  end(): void
  /** 显式取消（如 Esc），不看是否按够。 */
  cancel(): void
  isHolding(): boolean
}

export function createHold(
  handlers: HoldHandlers,
  options: { holdMs?: number; env?: Partial<HoldEnv> } = {},
): Hold {
  const env: HoldEnv = { ...browserEnv, ...options.env }
  const holdMs = options.holdMs ?? HOLD_MS

  let holding = false
  let startAt = 0
  let rafId = 0
  let timerId = 0

  const cleanup = () => {
    env.clearTimeout(timerId)
    env.caf(rafId)
    timerId = 0
    rafId = 0
  }

  /** 唯一的收尾。`holding` 先落，后面任何一条路再来都进不去。 */
  const finish = (commit: boolean) => {
    holding = false
    cleanup()
    handlers.onProgress(0)
    if (commit) handlers.onCommit()
    else handlers.onCancel?.()
  }

  const step = () => {
    if (!holding) return
    const p = Math.min(1, (env.now() - startAt) / holdMs)
    handlers.onProgress(p)
    if (p >= 1) {
      finish(true)
      return
    }
    rafId = env.raf(step)
  }

  return {
    start() {
      if (holding) return
      holding = true
      startAt = env.now()
      rafId = env.raf(step)
      timerId = env.setTimeout(() => {
        if (holding) finish(true)
      }, holdMs)
    },
    end() {
      if (!holding) return
      finish(env.now() - startAt >= holdMs)
    },
    cancel() {
      if (!holding) return
      finish(false)
    },
    isHolding: () => holding,
  }
}
