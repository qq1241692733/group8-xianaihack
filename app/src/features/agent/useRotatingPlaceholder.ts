import { useEffect, useState } from 'react'

/**
 * 输入框里轮流出现的几句灰字。
 *
 * 为什么轮播：一句话的 placeholder 会变成「这一屏只有一个功能」的暗示，
 * 而这里能问的东西很多。轮播把它变回「这里可以随便说」。
 *
 * 间隔刻意长（4.2s）：短了像跑马灯，会抢注意力，而这一屏的主角是中间的对话。
 * 传进来的数组必须是**模块级常量**（依赖引用稳定），否则每次渲染都会重开定时器。
 */
export function useRotatingPlaceholder(
  lines: readonly string[],
  intervalMs = 4200,
): string {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (lines.length <= 1) return
    const timer = window.setInterval(() => {
      setIndex((n) => (n + 1) % lines.length)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [lines, intervalMs])

  return lines[index % lines.length] ?? ''
}
