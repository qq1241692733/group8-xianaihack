/**
 * 相机不可用时的降级画面：用几团柔和光斑画一片「窗外」。
 *
 * 保留它不只是为了好看——getUserMedia 需要安全上下文，http 局域网、被拒权限、
 * 没有摄像头都可能发生。演示现场不能因为一个权限弹窗就黑屏。
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

/** 照片缩略图用的同一套颜色，避免列表里出现另一种「窗外」。 */
export const SCENE_GRADIENT = [
  'radial-gradient(circle at 30% 25%,rgba(255,220,165,.55),transparent 60%)',
  'radial-gradient(circle at 72% 65%,rgba(255,180,110,.4),transparent 60%)',
  'linear-gradient(160deg,#232a3a,#3a332f 60%,#16161b)',
].join(',')

export function paintScene(canvas: HTMLCanvasElement): void {
  canvas.width = W
  canvas.height = H

  const g = canvas.getContext('2d')
  if (!g) return

  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#1b2333')
  bg.addColorStop(0.45, '#2b3242')
  bg.addColorStop(0.75, '#4a3f3a')
  bg.addColorStop(1, '#15151a')
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
  g.fillStyle = 'rgba(10,10,14,.42)'
  g.fillRect(204, 0, 7, H)
  g.fillRect(0, 272, W, 6)
  g.fillStyle = 'rgba(255,236,205,.10)'
  g.fillRect(211, 0, 1.5, H)
  g.fillRect(0, 278, W, 1.5)

  // 暗角，让画面像透过玻璃看到的
  const vig = g.createRadialGradient(210, 270, 90, 210, 270, 330)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(6,6,10,.62)')
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
