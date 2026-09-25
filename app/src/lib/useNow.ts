import { useEffect, useState } from 'react'

/** 每秒一跳的「现在」。时钟、日期行、状态栏共用同一个节拍。 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return now
}
