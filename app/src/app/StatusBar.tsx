import { formatClock } from '@/lib/time'
import { useNow } from '@/lib/useNow'

/** 机身状态栏。时间是真实的，信号与电量是画出来的——这里不假装有系统集成。 */
export function StatusBar() {
  const now = useNow()

  return (
    <div className="statusbar">
      <div>{formatClock(now)}</div>
      <div className="statusbarRight">
        <div className="bars">
          <i />
          <i />
          <i />
          <i />
        </div>
        <svg
          width="16"
          height="12"
          viewBox="0 0 16 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M1 4.5a10 10 0 0 1 14 0" />
          <path d="M4 7.5a6 6 0 0 1 8 0" />
          <circle cx="8" cy="10" r=".6" fill="currentColor" />
        </svg>
        <div className="batt">
          <i />
        </div>
      </div>
    </div>
  )
}
