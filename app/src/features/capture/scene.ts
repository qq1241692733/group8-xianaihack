import type { ThemeMode } from '@/app/theme'

/**
 * 相机不可用时的降级画面：用几团柔和光斑画一片「窗外」。
 *
 * 保留它不只是为了好看——getUserMedia 需要安全上下文，http 局域网、被拒权限、
 * 没有摄像头都可能发生。演示现场不能因为一个权限弹窗就黑屏。
 *
 * 【昼 / 夜】第三段底色是**会静默出错**的一处（docs/18）：
 * 夜版的 #232a3a → #16161b 在纸面上会读成一个洞 ——
 * 54px 的缩略图本来就只有一点点面积，一块深底直接把列表戳穿。
 * 所以昼版把这一段整体抬到浅灰蓝。**光斑不动**：窗外那几团暖光两版都有。
 */

type Light = [x: number, y: number, r: number, rgbaPrefix: string, alpha: number]

const W = 420
const H = 560

const LIGHTS: Light[] = [
  [70, 120, 54, 'rgba(255,214,150,', 0.5],
  [150, 90, 34, 'rgba(255,236,200,', 0.42],
  [300, 150, 60, 'rgba(180,205,240,', 0.28],
  [350, 300, 80, 'rgba(255,190,120,', 0.3],
  [110, 350, 90, 'rgba(255,150,90,', 0.22],
  [240, 430, 120, 'rgba(120,140,180,', 0.22],
  [200, 200, 180, 'rgba(255,220,180,', 0.12],
]

interface ScenePalette {
  /** 底色的四段停靠点，从上到下。 */
  bg: [string, string, string, string]
  /** 窗框（竖中梃与横档）。 */
  mullion: string
  /** 窗框上的一道亮边。 */
  mullionHi: string
  /** 暗角。 */
  vignette: string
}

const SCENE: Record<ThemeMode, ScenePalette> = {
  night: {
    bg: ['#1b2333', '#2b3242', '#4a3f3a', '#15151a'],
    mullion: 'rgba(10,10,14,.42)',
    mullionHi: 'rgba(255,236,205,.10)',
    vignette: 'rgba(6,6,10,.62)',
  },
  day: {
    bg: ['#c8d2e2', '#d5d9e2', '#e2d8cc', '#c2c8d2'],
    mullion: 'rgba(92,102,122,.30)',
    mullionHi: 'rgba(255,252,244,.55)',
    vignette: 'rgba(92,102,122,.30)',
  },
}

/**
 * 照片缩略图用的同一套颜色，避免列表里出现另一种「窗外」。
 * 夜版是默认值——`features/agent/context.ts` 里那份静态引用保持原样。
 */
export function sceneGradient(mode: ThemeMode = 'night'): string {
  return [
    'radial-gradient(circle at 30% 25%,rgba(255,220,165,.55),transparent 60%)',
    'radial-gradient(circle at 72% 65%,rgba(255,180,110,.4),transparent 60%)',
    mode === 'day'
      ? 'linear-gradient(160deg,#d8dee8,#cfc9c2 60%,#bfc5ce)'
      : 'linear-gradient(160deg,#232a3a,#3a332f 60%,#16161b)',
  ].join(',')
}

/** 夜版常量。给不随主题走的消费者（agent 上下文）用。 */
export const SCENE_GRADIENT = sceneGradient('night')

export function paintScene(canvas: HTMLCanvasElement, mode: ThemeMode = 'night'): void {
  canvas.width = W
  canvas.height = H

  const g = canvas.getContext('2d')
  if (!g) return

  const p = SCENE[mode]

  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, p.bg[0])
  bg.addColorStop(0.45, p.bg[1])
  bg.addColorStop(0.75, p.bg[2])
  bg.addColorStop(1, p.bg[3])
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)

  for (const [x, y, r, prefix, alpha] of LIGHTS) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, `${prefix}${alpha})`)
    rg.addColorStop(1, `${prefix}0)`)
    g.fillStyle = rg
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }

  // 窗框：柔和的竖向中梃，不是黑色粗线
  g.fillStyle = p.mullion
  g.fillRect(204, 0, 7, H)
  g.fillRect(0, 272, W, 6)
  g.fillStyle = p.mullionHi
  g.fillRect(211, 0, 1.5, H)
  g.fillRect(0, 278, W, 1.5)

  // 暗角，让画面像透过玻璃看到的
  const vig = g.createRadialGradient(210, 270, 90, 210, 270, 330)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, p.vignette)
  g.fillStyle = vig
  g.fillRect(0, 0, W, H)

  // 玻璃反光
  const gl = g.createLinearGradient(0, 0, W, H)
  gl.addColorStop(0, 'rgba(255,255,255,.07)')
  gl.addColorStop(0.35, 'rgba(255,255,255,0)')
  gl.addColorStop(0.62, 'rgba(255,255,255,.045)')
  gl.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gl
  g.fillRect(0, 0, W, H)
}
