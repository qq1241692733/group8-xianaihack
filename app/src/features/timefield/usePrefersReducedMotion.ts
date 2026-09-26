import { useEffect, useState } from 'react'

/**
 * 系统的「减少动效」偏好。
 *
 * 时间场在这里不做「直接停机」——那会让场变成一张死图，等于把这个产品最核心的
 * 表达（它是个活的东西）整个拿走。降级做法是：保留约 0.02 倍速的形变，
 * 去掉指针跟随与一切高频位移。慢，但还在呼吸。
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matches())

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

function matches(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
