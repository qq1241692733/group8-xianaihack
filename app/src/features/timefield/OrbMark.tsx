import { useEffect, useRef } from 'react'

import { cssVar, useTheme } from '@/app/theme'

import { drawDotOrb } from './dotOrb'
import styles from './OrbMark.module.css'

/**
 * 那颗球在这一页的显影 —— 34px，和首页是**同一颗**（同一套网点、同一组取值）。
 *
 * 原来这里是 46px 的金色径向渐变加一圈金色外发光，在深底上就是一颗金月亮。两个问题：
 *  ① 一屏只有一颗彩色球 —— 这条纪律在理解页被破了；
 *  ② 金被降级成了装饰。金在这套系统里的定义是「**你按下的那一下**」的动作回执
 *     （罗盘命中 / 已保留 / 交给发现），不是身份标识。做成头像等于把强调色当 Logo 色。
 *
 * 因此换回这颗球：全 App 只有一颗球，这里那个小圆只是它在理解页的显影。
 * 不做动画 —— 会呼吸的是首页那一颗，这里是一个静止的记认。
 *
 * 昼 / 夜由 `--c1` / `--c2` 给出（见 tokens.css 的昼版覆盖块）：
 * 亮部两版都是淡蓝，暗部夜版是深靛、昼版是纯靛。**不能写死**——
 * 写死的话切到昼版，这一颗还是夜里的那一颗。
 */
export function OrbMark() {
  const ref = useRef<HTMLCanvasElement>(null)
  const { mode } = useTheme()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    drawDotOrb(canvas, {
      size: 34,
      gap: 0.8,
      light: cssVar('--c1', '#A9C8FF'),
      dark: cssVar('--c2', '#3A5ED6'),
    })
  }, [mode])

  return <canvas ref={ref} className={styles.mark} aria-hidden="true" />
}
