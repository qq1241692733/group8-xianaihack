import { describe, expect, it } from 'vitest'

import { createHold, HOLD_MS, type HoldHandlers } from './holdController'

/**
 * 长按判定的三条路：rAF / 定时器 / 墙钟。
 *
 * 三个都要单独钉住——因为真实的失败模式正是「其中一条被浏览器冻结了」：
 * 切走的标签页会同时节流 rAF 和 timer，只有墙钟还说得出「其实按够了」。
 * 所以这里的 env 全部可注入，每条路都能在不碰真实时钟的情况下跑。
 */

type Env = {
  now(): number
  raf(cb: () => void): number
  caf(id: number): void
  setTimeout(cb: () => void, ms: number): number
  clearTimeout(id: number): void
}

/** 一个手动时钟：rAF 与 timer 都只被记下来，由测试自己决定何时跑。 */
function manualEnv() {
  const box = {
    t: 0,
    rafCb: null as (() => void) | null,
    timerCb: null as (() => void) | null,
  }
  const env: Env = {
    now: () => box.t,
    raf: (cb) => {
      box.rafCb = cb
      return 1
    },
    caf: () => {
      box.rafCb = null
    },
    setTimeout: (cb) => {
      box.timerCb = cb
      return 7
    },
    clearTimeout: () => {
      box.timerCb = null
    },
  }
  return { box, env }
}

function spy() {
  const state = { commits: 0, cancels: 0, lastProgress: -1 }
  const handlers: HoldHandlers = {
    onProgress: (p) => {
      state.lastProgress = p
    },
    onCommit: () => {
      state.commits += 1
    },
    onCancel: () => {
      state.cancels += 1
    },
  }
  return { state, handlers }
}

describe('holdController · rAF 那条路', () => {
  it('跑到 1 就提交', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.start()
    box.t = HOLD_MS / 2
    box.rafCb?.()
    expect(state.commits).toBe(0)
    expect(state.lastProgress).toBeCloseTo(0.5)

    box.t = HOLD_MS
    box.rafCb?.()
    expect(state.commits).toBe(1)
    expect(state.lastProgress).toBe(0)
  })

  it('提交是幂等的：rAF 与定时器都到点也只提交一次', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.start()
    box.timerCb?.()
    box.t = HOLD_MS * 3
    box.rafCb?.()
    expect(state.commits).toBe(1)
  })
})

describe('holdController · 定时器那条路', () => {
  it('rAF 被冻住（时间也不动）时，定时器仍然提交', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.start()
    expect(box.rafCb).not.toBeNull()
    box.timerCb?.() // rAF 一次没跑，只有定时器到点
    expect(state.commits).toBe(1)
  })
})

describe('holdController · 松手那一刻的墙钟', () => {
  it('rAF 和定时器都被冻住，但墙钟显示按够了 → 松手仍提交', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.start()
    box.t = HOLD_MS // 时钟在走，但没有任何一条回调用过
    hold.end()
    expect(state.commits).toBe(1)
    expect(state.cancels).toBe(0)
  })

  it('松手太早 → 取消，不提交', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.start()
    box.t = HOLD_MS - 1
    hold.end()
    expect(state.commits).toBe(0)
    expect(state.cancels).toBe(1)
    expect(state.lastProgress).toBe(0)
  })

  it('没按下时松手什么都不做', () => {
    const { env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.end()
    expect(state.commits).toBe(0)
    expect(state.cancels).toBe(0)
  })
})

describe('holdController · 显式取消', () => {
  it('按了多久，cancel 都不提交', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.start()
    expect(hold.isHolding()).toBe(true)
    box.t = HOLD_MS * 5
    hold.cancel()
    expect(state.commits).toBe(0)
    expect(state.cancels).toBe(1)
    expect(hold.isHolding()).toBe(false)
  })

  it('取消后 rAF / 定时器都不再能触发提交', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env })

    hold.start()
    const raf = box.rafCb
    const timer = box.timerCb
    hold.cancel()
    raf?.()
    timer?.()
    expect(state.commits).toBe(0)
  })
})

describe('holdController · 时长可调', () => {
  it('自定义 holdMs 生效', () => {
    const { box, env } = manualEnv()
    const { state, handlers } = spy()
    const hold = createHold(handlers, { env, holdMs: 300 })

    hold.start()
    box.t = 300
    hold.end()
    expect(state.commits).toBe(1)
  })
})
