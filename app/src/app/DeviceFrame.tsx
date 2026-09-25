import type { ReactNode } from 'react'

/**
 * 手机外壳。桌面宽屏显示圆角机身 + 侧键；窄屏（≤430px）机身退场、直接铺满，
 * 变成真机 App。规则全在 global.css 的媒体查询里，这里只负责结构。
 */
export function DeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="studio">
      <div className="device">
        <div className="island" />
        <div className="screen">{children}</div>
      </div>
      <div className="hintBar">
        <span>
          建议路径：先按几次 <b>开始专注</b>，它不会启动
        </span>
        <span>
          然后点最小的那行 <b>留下一刻</b> → 再去 <b>理解</b>
        </span>
      </div>
    </div>
  )
}
