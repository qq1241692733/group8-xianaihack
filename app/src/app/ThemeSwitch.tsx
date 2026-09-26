import { hasCap } from '@/lib/stage'

import { useTheme, type ThemePref } from './theme'
import styles from './ThemeSwitch.module.css'

/**
 * 昼 / 夜 / 跟随系统 —— **外壳上的一枚快捷开关**。
 *
 * 产品里已经有了它：首页右上角的「设置」浮层（见 SettingsOverlay）。
 * 留在外壳上的理由只剩两条，都是给演示用的：
 *  ① 路演时不用点进 App 就能当场翻；
 *  ② 无头截图能一次拿全两套，不必驱动浮层。
 * 所以 `&cap=1`（截图模式）下它会自己收起——验收图里不该出现外壳。
 */

const OPTIONS: Array<{ id: ThemePref; label: string }> = [
  { id: 'system', label: '跟随系统' },
  { id: 'day', label: '白天' },
  { id: 'night', label: '黑夜' },
]

export function ThemeSwitch() {
  const { pref, setPref } = useTheme()

  // 截图模式（&cap=1）：这块浮标是外壳，不该出现在验收图里。
  if (hasCap()) return null

  return (
    <div className={styles.wrap} role="group" aria-label="主题">
      <span className={styles.lead}>主题</span>
      <div className={styles.seg}>
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`${styles.opt}${pref === o.id ? ` ${styles.on}` : ''}`}
            aria-pressed={pref === o.id}
            onClick={() => setPref(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
