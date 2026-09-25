import { useEffect } from 'react'

import { useStore } from '@/app/store'

/**
 * 把 store 里那支待浮现的队列，按节奏一句一句落到界面上。
 *
 * 为什么在这里而不是 store 里：定时器必须能随面板离开而取消。store 是模块级单例，
 * 放进去的 setTimeout 会活得比界面久。队列本身留在 store（切 Tab 不丢、可续播），
 * 只有「驱动」这一件事归 React。
 *
 * 为什么不会触发 react-hooks/set-state-in-effect：effect 体里只**调度**定时器，
 * 真正的提交发生在 setTimeout 回调里，那是另一个函数的作用域。
 * （同款写法见 NothingOverlay 的 AmbientLines。）
 */
export function useAiDialogue(): void {
  const pane = useStore((s) => s.pane)
  const aiStarted = useStore((s) => s.aiStarted)
  const hydrated = useStore((s) => s.hydrated)
  const aiBegun = useStore((s) => s.aiBegun)
  const draining = useStore((s) => s.aiQueue.length > 0)

  useEffect(() => {
    if (pane !== 'ai' || !aiStarted || !hydrated) return

    const store = useStore.getState()

    // 等 hydrate 完才组戏——否则会拿一个空库算数字。
    if (!store.aiBegun) {
      store.aiBegin()
      return
    }

    if (!draining) return

    let cancelled = false
    let timer: number | undefined

    const step = () => {
      const head = useStore.getState().aiQueue[0]
      if (!head || cancelled) return

      timer = window.setTimeout(() => {
        // 中途离开就别再落了：这一句留在队首，回来接着播。
        if (cancelled || useStore.getState().pane !== 'ai') return
        useStore.getState().aiCommitHead()
        step()
      }, head.gapMs)
    }

    step()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [pane, aiStarted, hydrated, aiBegun, draining])
}
