import { cssVar, type ThemeMode } from '@/app/theme'

/**
 * 网点球 —— 「此刻」里唯一那颗球的绘制核心。
 *
 * 球的密度就是那个数字：留下的东西越多，网眼越密、看着越亮。所以界面上一个数字
 * 都不用写（第一条纪律：不给数字）—— 密度替它说完了。
 *
 * 两处用它，同一套几何，不许各写一遍：
 *   ① `drawDotOrb()`：**静态**的一颗，「理解」页那个 34px 头像（size 34 / gap 0.80）。
 *   ② `DotOrb`：首页那颗**动态**的（呼吸 / 按下 / 进食 / 变密），直接复用
 *      `drawDotOrbTexture` 铺网，自己只管弹性与合成。
 *
 * 参数逐值来自 `index.html` 的 `Orb`（其昼版即基准稿 `index_demo_light_v2.html`）：
 * 主场 size 190 / gap 3.10。
 * 暗部**必须比屏底亮**（夜 #1C3488 vs 屏底 #090D13），否则球就变成一个洞。
 */

type Vec3 = [number, number, number]

/** 辉光基色。深底上球是「光源」，没有这一层它就只是一张贴纸。 */
const GLOW_RGB = '58,94,214'
const GLOW_ALPHA = 0.205

/** 受光点：左上。全 App 只有这一个光源方向。 */
const HX = 0.3
const HY = 0.24

function hex2rgb(hex: string): Vec3 {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function mixTo(a: Vec3, b: Vec3, t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(
    a[1] + (b[1] - a[1]) * t,
  )},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function smooth(v: number): number {
  return v * v * (3 - 2 * v)
}

/** 确定性伪随机。同一颗球每次画出来必须一模一样 —— 会抖的纹理不是材质，是噪音。 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DotOrbSpec {
  /** 球的直径（CSS 像素）。 */
  size: number
  /** 网点间距。间距越小越密 —— 34px 头像用 0.8，280px 主场用 3.10。 */
  gap: number
  /** 受光侧的网点颜色（球亮部）。 */
  light: string
  /** 背光侧的网点颜色（球暗部）。 */
  dark: string
}

/**
 * 把网点铺进当前路径的坐标空间。调用方负责裁剪（圆）与缩放。
 * 抽出它是因为首页那颗球将来要用同一个函数 —— 两处必须同源。
 */
export function drawDotOrbTexture(
  ctx: CanvasRenderingContext2D,
  size: number,
  gap: number,
  light: string,
  dark: string,
): void {
  const R = size / 2
  const c1 = hex2rgb(light)
  const c2 = hex2rgb(dark)
  const rnd = mulberry32(20260926)
  const hx = size * HX
  const hy = size * HY

  ctx.globalAlpha = 1
  for (let y = gap * 0.5; y < size; y += gap) {
    // 隔行错半格：正方排列在圆里会读成一张网格，错开才像材质。
    const shift = Math.round(y / gap) % 2 ? gap * 0.5 : 0
    for (let x = gap * 0.5 + shift; x < size; x += gap) {
      const dx = (x - R) / R
      const dy = (y - R) / R
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > 1) continue

      // 受光量：离受光点越远越暗（球面感由此而来）。
      const hdx = x - hx
      const hdy = y - hy
      const lum = smooth(1 - Math.min(1, Math.sqrt(hdx * hdx + hdy * hdy) / (R * 1.36)))

      // 明暗方向：右下压暗，左上提亮 —— 与 CSS 的高光落在同一侧。
      const shade = clamp(((x - R) * 0.62 + (y - R) * 0.78) / (R * 1.58) + 0.5, 0, 1)

      // 边缘两套衰减：edgeD 收小网点的半径，edgeA 让它淡出 —— 球因此有「边」。
      const edgeD = smooth(clamp((1 - d) / 0.13, 0, 1))
      const edgeA = smooth(clamp((1 - d) / 0.08, 0, 1))

      const t = 1 - clamp(shade * 0.86 - lum * 0.34, 0, 0.95)
      let r = gap * 0.555 * (1 - 0.46 * lum) * (0.3 + 0.7 * edgeD)
      r *= 0.96 + rnd() * 0.08
      if (r < 0.13) continue

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = mixTo(c2, c1, t)
      ctx.globalAlpha = (0.93 + rnd() * 0.07) * edgeA
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

/**
 * 画一整颗静态球：辉光 → 网点 → 高光 → 外圈细线。
 * 画布会按设备像素比放大，所以传进来的 size 就是它显示出来的尺寸。
 */
export function drawDotOrb(canvas: HTMLCanvasElement, spec: DotOrbSpec): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const { size, gap, light, dark } = spec
  canvas.width = Math.round(size * dpr)
  canvas.height = Math.round(size * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  const R = size / 2

  /* 常驻辉光，画在球的下层。半径收在**画布内**：画布是方的，铺到 2R 会顶到四边，
     夜里那圈淡蓝就变成一个方块（首页那颗球踩过同一个坑，见 DotOrb.render ①）。 */
  const glowR = Math.max(1, R * 0.94)
  const gg = ctx.createRadialGradient(R, R, R * 0.55, R, R, glowR)
  gg.addColorStop(0, `rgba(${GLOW_RGB},${GLOW_ALPHA})`)
  gg.addColorStop(0.6, `rgba(${GLOW_RGB},${GLOW_ALPHA * 0.3})`)
  gg.addColorStop(1, `rgba(${GLOW_RGB},0)`)
  ctx.beginPath()
  ctx.arc(R, R, glowR, 0, Math.PI * 2)
  ctx.fillStyle = gg
  ctx.fill()

  /* 球体本身。 */
  const tex = document.createElement('canvas')
  tex.width = canvas.width
  tex.height = canvas.height
  const tctx = tex.getContext('2d')
  if (!tctx) return
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  drawDotOrbTexture(tctx, size, gap, light, dark)
  ctx.drawImage(tex, 0, 0, size, size)

  /* 左上高光：球是个立体，不是一枚圆形贴纸。 */
  const hlR = size * 0.42
  const hcx = R - size * 0.2
  const hcy = R - size * 0.26
  const gr = ctx.createRadialGradient(hcx, hcy, 0, hcx, hcy, hlR)
  gr.addColorStop(0, 'rgba(255,255,255,0.28)')
  gr.addColorStop(0.55, 'rgba(255,255,255,0.076)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.beginPath()
  ctx.arc(R, R, R, 0, Math.PI * 2)
  ctx.fillStyle = gr
  ctx.fill()

  /* 外圈细线：深底上需要一条清晰的边，但不能刺眼。 */
  ctx.beginPath()
  ctx.arc(R, R, R - 0.7, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(198,218,255,0.32)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/* ============================================================
 * 动态的那颗球（首页）
 * ============================================================ */

/** 画布画不出 CSS 变量的那一部分，逐值取自 `index.html` 的 `TOKENS`。 */
export interface OrbPalette {
  /** 球亮部。来自 tokens.css 的 --c1，切主题时 CSS 已经换过。 */
  c1: string
  /** 球暗部。来自 --c2。 */
  c2: string
  /** 变密时暗部往哪走。昼往「沉」（暗），夜往「亮」——同一个动作，两种读法。 */
  dens: Vec3
  /** 常驻辉光：只有夜版有。纸白上辉光只会糊出一圈脏。 */
  glow: boolean
  glowA: number
  /** 高光基准强度。昼版更强，球才立得住。 */
  hlA: number
  /** 外圈细线的 rgba 前缀（不含 alpha 与右括号）。 */
  ring: string
  ringA: number
  /** 按下时的外光晕。 */
  pressGlow: string
  pressA: number
  pressR: number
}

const ORB_THEME: Record<ThemeMode, Omit<OrbPalette, 'c1' | 'c2'>> = {
  day: {
    dens: [26, 64, 140],
    glow: false,
    glowA: 0,
    hlA: 0.44,
    ring: 'rgba(255,255,255,',
    ringA: 0.5,
    pressGlow: '58,94,214',
    pressA: 0.13,
    pressR: 1.3,
  },
  night: {
    dens: [124, 156, 240],
    glow: true,
    glowA: 0.205,
    hlA: 0.28,
    ring: 'rgba(198,218,255,',
    ringA: 0.32,
    pressGlow: '108,140,240',
    pressA: 0.17,
    pressR: 1.34,
  },
}

/**
 * 组装一颗球的色板。亮部/暗部走 `cssVar` 从 tokens.css 读 —— 颜色的唯一出处仍在那份
 * 令牌里，这里只补画布专有的量（辉光、高光、外圈、按下光晕）。
 */
export function orbPalette(mode: ThemeMode): OrbPalette {
  const t = ORB_THEME[mode]
  return {
    ...t,
    c1: cssVar('--c1', mode === 'day' ? '#b7cffa' : '#a9c8ff'),
    c2: cssVar('--c2', mode === 'day' ? '#3a5ed6' : '#1c3488'),
  }
}

export interface DotOrbOptions {
  /** 画布尺寸（CSS 像素）。 */
  cw: number
  ch: number
  /** 0 级时的直径与网点间距。主场 190 / 3.10，快门钮 70 / 1.42。 */
  size: number
  gap: number
  palette: OrbPalette
}

function toHex(v: Vec3): string {
  return `#${v.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * 首页那颗球。与基准稿的 `Orb` 同一套动作：
 * 呼吸 = 网点整体聚散（不是形状变形，白底上形状抖动会脏）；
 * 按下 = 缩小一点、高光加强、外圈一圈辉光；进食 = 一条**不过冲**的弹簧（k=58 c=8.2）。
 */
export class DotOrb {
  readonly CW: number
  readonly CH: number

  private ctx: CanvasRenderingContext2D
  private pal: OrbPalette
  private baseSize: number
  private baseGap: number
  private dpr: number
  private tex: HTMLCanvasElement
  /** 当前实际直径（0 级 = baseSize，变密后更大）。 */
  size: number

  private level = 0
  private press = 0
  private pressT = 0
  private feed = 0
  private feedV = 0
  private dirA = 0
  private dirAmt = 0
  private dirT = 0
  private intro = 0

  constructor(canvas: HTMLCanvasElement, opts: DotOrbOptions) {
    const { cw, ch, size, gap, palette } = opts
    this.CW = cw
    this.CH = ch
    this.baseSize = size
    this.baseGap = gap
    this.pal = palette
    this.dpr = Math.min(window.devicePixelRatio || 1, 3)

    canvas.width = Math.round(cw * this.dpr)
    canvas.height = Math.round(ch * this.dpr)
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx = ctx

    this.size = size
    this.tex = document.createElement('canvas')
    this.build()
  }

  /** 切主题后重建纹理：颜色变了，网点的值也跟着变。 */
  setPalette(pal: OrbPalette): void {
    this.pal = pal
    this.build()
  }

  /** 变密。**只在 level 真的变了时 rebuild** —— build() 不便宜。 */
  setLevel(n: number): void {
    const next = Math.max(0, Math.min(9, Math.round(n)))
    if (next === this.level) return
    this.level = next
    this.build()
  }

  densify(): void {
    this.setLevel(this.level + 1)
  }

  reset(): void {
    this.level = 0
    this.build()
  }

  /** 进食：给弹簧一个初速度。碎片飞回球心时用。 */
  pulse(v: number): void {
    this.feedV = v
  }

  setPress(p: number): void {
    this.pressT = p
  }

  /** 命中某个方向：球朝那个方向偏一点。 */
  setDir(ang: number, amt: number): void {
    this.dirA = ang
    this.dirT = amt
  }

  private geom(): { size: number; gap: number; dark: string } {
    const L = Math.min(this.level, 9)
    return {
      size: this.baseSize + L * 2.1,
      gap: this.baseGap - L * 0.052,
      dark: toHex(mixVec(hex2rgb(this.pal.c2), this.pal.dens, L * 0.085)),
    }
  }

  private build(): void {
    const g = this.geom()
    const off = document.createElement('canvas')
    off.width = Math.round(g.size * this.dpr)
    off.height = Math.round(g.size * this.dpr)
    const c = off.getContext('2d')
    if (!c) return
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    drawDotOrbTexture(c, g.size, g.gap, this.pal.c1, g.dark)
    this.tex = off
    this.size = g.size
  }

  render(dt: number, t: number, reduced: boolean): void {
    const { ctx, CW, CH, pal: P } = this

    ctx.clearRect(0, 0, CW, CH)

    // 减慢动效时直落目标，不做插值 —— 弹簧在 0.001ms 的过渡里会抖。
    this.press += (this.pressT - this.press) * (reduced ? 1 : Math.min(1, dt * 11))
    this.dirAmt += (this.dirT - this.dirAmt) * (reduced ? 1 : Math.min(1, dt * 9))
    if (reduced) {
      this.feed = 0
      this.feedV = 0
    } else {
      // 进食弹簧：k=58 c=8.2，阻尼比锁 1.0，不过冲。
      this.feedV += (-this.feed * 58 - this.feedV * 8.2) * dt
      this.feed += this.feedV * dt
    }
    if (this.intro < 1) this.intro = Math.min(1, this.intro + (reduced ? 1 : dt / 1.05))

    const b = reduced ? 0 : Math.sin(t * 1.05)
    const e = this.intro < 1 ? 1 - (1 - this.intro) ** 3 : 1

    let sc = 1 + b * 0.01 * (1 - this.press * 0.6) - this.press * 0.072 + this.feed * 0.062
    sc *= lerp(0.8, 1, e)

    const dx = Math.cos(this.dirA) * this.dirAmt * 9
    const dy = Math.sin(this.dirA) * this.dirAmt * 9
    const cx = CW / 2 + dx
    const cy = CH / 2 + dy
    const w = this.size * sc
    const h = this.size * sc

    // ① 常驻辉光（只有夜）。画在球的下层。
    //
    // 半径**必须在画布内衰减到 0**：画布是方的，按球径的 2 倍去铺，
    // 圆的边会超出画布，于是整块画布被铺上一层淡蓝、边是直的 —— 夜里能看见一个方块。
    // 上限再扣 12px：球会随方向最多偏移 9px，圆的边缘仍要落在画布内。
    const maxGlowR = Math.max(1, Math.min(CW, CH) / 2 - 12)
    if (P.glow) {
      const glowR = Math.max(1, Math.min((w / 2) * 1.6, maxGlowR))
      const glowA = P.glowA + b * 0.036 + this.press * 0.15 + this.feed * 0.1
      const gg = ctx.createRadialGradient(cx, cy, (w / 2) * 0.6, cx, cy, glowR)
      gg.addColorStop(0, `rgba(58,94,214,${glowA.toFixed(3)})`)
      gg.addColorStop(0.6, `rgba(48,78,190,${(glowA * 0.3).toFixed(3)})`)
      gg.addColorStop(1, 'rgba(40,64,160,0)')
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fillStyle = gg
      ctx.globalAlpha = e
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // ② 球体本身（预渲染的网点纹理）。
    ctx.save()
    ctx.globalAlpha = e
    ctx.drawImage(this.tex, cx - w / 2, cy - h / 2, w, h)
    ctx.restore()

    // ③ 左上高光。
    const hlR = this.size * 0.42 * sc * (1 - this.press * 0.3 + this.feed * 0.22)
    const hlA = P.hlA + this.press * 0.2 + this.feed * 0.12
    const hcx = CW / 2 + dx * 0.7 - this.size * 0.2 * sc
    const hcy = CH / 2 + dy * 0.7 - this.size * 0.26 * sc
    const gr = ctx.createRadialGradient(hcx, hcy, 0, hcx, hcy, Math.max(1, hlR))
    gr.addColorStop(0, `rgba(255,255,255,${hlA.toFixed(3)})`)
    gr.addColorStop(0.55, `rgba(255,255,255,${(hlA * 0.27).toFixed(3)})`)
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.beginPath()
    ctx.arc(cx, cy, w / 2, 0, Math.PI * 2)
    ctx.fillStyle = gr
    ctx.globalAlpha = e
    ctx.fill()
    ctx.globalAlpha = 1

    // ④ 外圈细边：昼是白内衬（把球从纸面托起），夜是月亮的轮廓。
    ctx.beginPath()
    ctx.arc(cx, cy, w / 2 - 0.7, 0, Math.PI * 2)
    ctx.strokeStyle = `${P.ring}${(P.ringA * e).toFixed(3)})`
    ctx.lineWidth = 1
    ctx.stroke()

    // ⑤ 按下时的外光晕。半径同样收在画布内（理由见 ①）。
    if (this.press > 0.01) {
      const pressR = Math.max(1, Math.min((w / 2) * P.pressR, maxGlowR))
      const gh = ctx.createRadialGradient(cx, cy, (w / 2) * 0.92, cx, cy, pressR)
      gh.addColorStop(0, `rgba(${P.pressGlow},${(P.pressA * this.press).toFixed(3)})`)
      gh.addColorStop(1, `rgba(${P.pressGlow},0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, pressR, 0, Math.PI * 2)
      ctx.fillStyle = gh
      ctx.fill()
    }
  }
}

function mixVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
