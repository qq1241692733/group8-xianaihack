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
          在「此刻」上，把 <b>文字 / 图片 / 声音</b> 攒进那颗球
        </span>
        <span>
          然后 <b>长按</b>「记下此刻」，一次落成一件事
        </span>
        <span>
          再去 <b>发现</b> 与 <b>理解</b>
        </span>
      </div>
    </div>
  )
}
