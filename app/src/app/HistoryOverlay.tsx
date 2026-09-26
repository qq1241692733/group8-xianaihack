import { Overlay } from '@/app/Overlay'
import { useStore } from '@/app/store'
import { formatDayLabel, formatTimeOfDay } from '@/lib/time'

import styles from './HistoryOverlay.module.css'

/**
 * 历史对话。
 *
 * 「理解」右上角点开。列表里是**归档过的**那几段——当前这段不在里面，
 * 因为它是活的（见 features/agent/sessions.ts 的模型说明）。
 *
 * 点一行就回到那一段，先把当前这段归档，再换。删一行没有确认——
 * 与守望一个道理：论迹不论心，删掉就散了。
 */
export function HistoryOverlay() {
  const sessions = useStore((s) => s.sessions)
  const openSession = useStore((s) => s.openSession)
  const removeSession = useStore((s) => s.removeSession)
  const closeOverlay = useStore((s) => s.closeOverlay)

  return (
    <Overlay id="history" closeLabel="关闭" title="历史对话">
      <div className={styles.wrap}>
        {sessions.length === 0 ? (
          <p className={styles.empty}>
            还没有别的对话。
            <br />
            这一段结束后，它会出现在这里。
          </p>
        ) : (
          <div className={styles.list}>
            {sessions.map((session) => (
              <div key={session.id} className={styles.row}>
                <button
                  type="button"
                  className={styles.open}
                  onClick={() => {
                    openSession(session.id)
                    closeOverlay()
                  }}
                >
                  <span className={styles.title}>{session.title}</span>
                  <span className={styles.when}>
                    {formatDayLabel(session.updatedAt)} {formatTimeOfDay(session.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.del}
                  aria-label={`删掉「${session.title}」`}
                  onClick={() => removeSession(session.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Overlay>
  )
}
