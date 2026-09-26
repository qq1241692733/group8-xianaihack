/**
 * 碎片 —— 留下之后，从屏幕中间飞回球心的那一把亮点。
 *
 * 它是「收下了」这件事唯一的一次动画：没有 toast、没有对勾、没有一句「已保存」。
 * 碎片落回球里，球自己变密一点，球下那句换成刚留下的事实。就这些。
 *
 * 逐条对齐基准稿 index_demo_light_v2.html 的 Sparks：先向外炸一下
 * （sin 包络，峰值约 0.42），再被拉向目标点，过程中变小、变淡。
 */

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  life: number
  dur: number
  r: number
  c: string
  px?: number
  py?: number
  alpha?: number
  rr?: number
  done?: boolean
}

/** 确定性伪随机：碎片每次飞都不该一样，但 burst 期间必须可复现（调试时看得到同一把）。 */
function mulberry32(a: number): () => number {
  let s = a
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export class Sparks {
  private cv: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private dpr: number
  private list: Spark[] = []
  /** 全部碎片落地时回调一次。用来给球一个脉冲。 */
  onArrive: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.ctx = canvas.getContext('2d')
    this.resize()
  }

  /** 画布按元素的**布局尺寸**（未缩放的 CSS px）开背面缓冲；外壳的 transform 缩放不用管。 */
  resize(): void {
    const w = this.cv.offsetWidth
    const h = this.cv.offsetHeight
    if (w === 0 || h === 0) return
    this.cv.width = Math.round(w * this.dpr)
    this.cv.height = Math.round(h * this.dpr)
    const ctx = this.cv.getContext('2d')
    if (ctx) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      this.ctx = ctx
    }
  }

  /** 从 (x,y) 炸出一把，飞向 (tx,ty)。坐标为画布本地 px。 */
  burst(x: number, y: number, tx: number, ty: number, color: string, n = 64): void {
    this.resize()
    const rnd = mulberry32((Date.now() & 0xffff) + n)
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2
      const sp = 20 + rnd() * 90
      this.list.push({
        x: x + (rnd() - 0.5) * 26,
        y: y + (rnd() - 0.5) * 26,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        tx,
        ty,
        life: 0,
        dur: 0.62 + rnd() * 0.3,
        r: 1 + rnd() * 2,
        c: color,
      })
    }
  }

  update(dt: number): void {
    const keep: Spark[] = []
    for (const p of this.list) {
      p.life += dt
      const k = p.life / p.dur
      if (k >= 1) {
        if (!p.done && this.onArrive) {
          this.onArrive()
          p.done = true
        }
        continue
      }
      const e = k * k * (3 - 2 * k)
      const burst = Math.sin(Math.PI * Math.min(1, k * 2.1)) * 0.42
      p.px = lerp(p.x, p.tx, e) + p.vx * burst * 0.9
      p.py = lerp(p.y, p.ty, e) + p.vy * burst * 0.9
      p.alpha = (1 - k) * 0.9
      p.rr = p.r * (1 - k * 0.45)
      keep.push(p)
    }
    this.list = keep
  }

  draw(): void {
    const ctx = this.ctx
    if (!ctx) return
    ctx.clearRect(0, 0, this.cv.offsetWidth, this.cv.offsetHeight)
    for (const p of this.list) {
      if (p.px == null || p.py == null || p.rr == null) continue
      ctx.beginPath()
      ctx.arc(p.px, p.py, p.rr, 0, Math.PI * 2)
      ctx.globalAlpha = p.alpha ?? 1
      ctx.fillStyle = p.c
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}
