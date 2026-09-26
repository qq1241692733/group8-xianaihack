import { useEffect } from 'react'

import { useStore } from '@/app/store'

/**
 * 把队列里的回执一句一句放出来。
 *
 * 队列留在 store 里（切 Tab 不丢、可以续播），这里只按 `gapMs` 推进一条：
 * 落下 → 队列少一条 → effect 重跑 → 放下一条。
 *
 * **没有「AI 开场」**。原来那套脚本走位（开场逐句、回复选项、并列出口）
 * 连同 `useAiDialogue` 一起删了 —— 理解页现在是一个找回线索的入口，
 * 所以它只在**真有回执**时才工作：你说一句，本地查询或成册判定回你一个回执，仅此而已。
 */
export function useAiQueue(): void {
  const head = useStore((s) => s.aiQueue[0])
  const advance = useStore((s) => s.aiAdvance)

  useEffect(() => {
    if (!head) return
    const timer = window.setTimeout(advance, head.gapMs)
    return () => window.clearTimeout(timer)
  }, [head, advance])
}
