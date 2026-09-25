import type { ReactNode } from 'react'

import { useStore, type Pane } from './store'
import styles from './TabBar.module.css'

type TabDef = { id: Pane; label: string; icon: ReactNode }

const TABS: TabDef[] = [
  {
    id: 'moment',
    label: '此刻',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="2.6" />
      </>
    ),
  },
  {
    id: 'time',
    label: '时间',
    icon: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 3.6V7.2h3.6" />
        <path d="M12 7.6V12l3.2 2" />
      </>
    ),
  },
  {
    id: 'ai',
    label: '理解',
    icon: (
      <>
        <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
        <circle cx="12" cy="12" r="3.2" />
      </>
    ),
  },
]

export function TabBar() {
  const pane = useStore((s) => s.pane)
  const goPane = useStore((s) => s.goPane)

  return (
    <nav className={styles.tabbar}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`${styles.tab}${pane === tab.id ? ` ${styles.on}` : ''}`}
          onClick={() => goPane(tab.id)}
        >
          <svg viewBox="0 0 24 24">{tab.icon}</svg>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
