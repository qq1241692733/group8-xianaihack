"""
「此刻」logo 生成器 —— 输出 SVG 矢量稿 + APK 图标 PNG。

设计约束（来自 docs/15、docs/17 与项目长期约定）：
- logo 必须是 App 首页**那颗球**，不是另起炉灶的图形。
- 昼版球是**墨点**（#B7CFFA → #3A5ED6 → #1A408C），不是光源。
- 球面点阵**疏密不均** —— 那是「随时间变密」留下的痕迹，不是装饰。
- 金（#B8842F / #E0A95E）是「按下的那一下」的动作回执，不是身份色，logo 不用。
- 点阵用固定 seed 生成，保证 SVG 与 PNG、各尺寸之间完全一致。
"""

from __future__ import annotations

import math
import random
from pathlib import Path

# ── 品牌色 ────────────────────────────────────────────────────────────────
DAY_C1 = "#B7CFFA"   # 昼版球亮端
DAY_C2 = "#3A5ED6"   # 昼版球主色
DAY_C3 = "#1A408C"   # 昼版球暗部（墨点的深度）
NIGHT_C1 = "#A9C8FF" # 夜版球亮端（光源）
NIGHT_C2 = "#1C3488" # 夜版球暗部

GOLDEN = 2.399963229728653  # Vogel 螺旋角


def density(u: float, v: float, power: float = 1.6, floor: float = 0.10) -> float:
    """点阵密度场：沿右下方向递增。疏密不均 = 时间的痕迹。"""
    t = (u + v + 2.0) / 4.0              # 0=左上（最早），1=右下（此刻）
    t = min(1.0, max(0.0, t))
    return floor + (1.0 - floor) * (t ** power)


def dot_field(
    cx: float, cy: float, radius: float,
    n_target: int, seed: int,
    r_lo: float, r_hi: float,
    op_lo: float, op_hi: float,
    power: float = 1.6,
) -> list[tuple[float, float, float, float]]:
    """在圆内生成疏密不均的点阵。同一 seed 永远给出同一份点。"""
    rng = random.Random(seed)
    n_cand = int(n_target * 2.7)
    pts: list[tuple[float, float, float, float]] = []
    for i in range(n_cand):
        r = radius * math.sqrt((i + 0.5) / n_cand)
        th = i * GOLDEN
        x = cx + r * math.cos(th)
        y = cy + r * math.sin(th)
        d = density((x - cx) / radius, (y - cy) / radius, power)
        if rng.random() < d:
            # 密处点更小更实，疏处点更大更淡 —— 视觉重量才平衡
            pts.append((x, y, r_hi + (r_lo - r_hi) * d, op_lo + (op_hi - op_lo) * d))
    return pts


def dots_svg(pts, color: str = "#ffffff") -> str:
    out = []
    for x, y, r, op in pts:
        out.append(
            f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}" '
            f'fill="{color}" fill-opacity="{op:.3f}"/>'
        )
    return "\n    ".join(out)


# ── 三个方向 ──────────────────────────────────────────────────────────────

def logo_mo(size: int = 512, seed: int = 7) -> str:
    """A · 墨球 —— 主推。一颗球，疏密不均的点。没有容器，没有文字。"""
    c = size / 2
    r = size * 0.30
    pts = dot_field(c, c, r * 0.94, 120, seed,
                    r_lo=size * 0.0055, r_hi=size * 0.0115,
                    op_lo=0.45, op_hi=0.92)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="此刻">
  <defs>
    <radialGradient id="orb" cx="34%" cy="30%" r="82%">
      <stop offset="0%" stop-color="{DAY_C1}"/>
      <stop offset="52%" stop-color="{DAY_C2}"/>
      <stop offset="100%" stop-color="{DAY_C3}"/>
    </radialGradient>
  </defs>
  <circle cx="{c}" cy="{c}" r="{r}" fill="url(#orb)"/>
  <g>
    {dots_svg(pts)}
  </g>
</svg>'''


def logo_breath(size: int = 512, seed: int = 11) -> str:
    """B · 缺口环 —— 那道缺口就是「允许自己停下来」的呼吸。"""
    c = size / 2
    r_orb = size * 0.20
    r_ring = size * 0.365
    # 环上的点：沿角度分布，缺口留在右上（约 -70°~ -20°）
    rng = random.Random(seed)
    ring_pts = []
    n = 132
    for i in range(n):
        deg = -90 + 360 * i / n
        if -72 <= deg <= -18:
            continue                       # 缺口
        th = math.radians(deg)
        d = density(math.cos(th), math.sin(th), 1.5, 0.22)
        if rng.random() < d:
            x = c + r_ring * math.cos(th)
            y = c + r_ring * math.sin(th)
            rad = size * (0.016 + 0.010 * d)
            op = 0.34 + 0.62 * d
            ring_pts.append((x, y, rad, op))
    orb_pts = dot_field(c, c, r_orb * 0.94, 22, seed + 1,
                        r_lo=size * 0.008, r_hi=size * 0.013,
                        op_lo=0.45, op_hi=0.88)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="此刻">
  <defs>
    <radialGradient id="orb" cx="34%" cy="30%" r="82%">
      <stop offset="0%" stop-color="{DAY_C1}"/>
      <stop offset="52%" stop-color="{DAY_C2}"/>
      <stop offset="100%" stop-color="{DAY_C3}"/>
    </radialGradient>
  </defs>
  <g>
    {dots_svg(ring_pts, DAY_C2)}
  </g>
  <circle cx="{c}" cy="{c}" r="{r_orb}" fill="url(#orb)"/>
  <g>
    {dots_svg(orb_pts)}
  </g>
</svg>'''


def logo_halo(size: int = 512, seed: int = 23) -> str:
    """C · 光源 —— 夜里唯一的那颗。光晕只作辅助，浅底上不靠它立住。"""
    c = size / 2
    r = size * 0.235
    halo = []
    for k in range(1, 6):
        rr = r + size * 0.052 * k
        op = 0.16 * (1 - k / 6.2)
        halo.append(f'<circle cx="{c}" cy="{c}" r="{rr:.1f}" fill="{NIGHT_C1}" fill-opacity="{op:.3f}"/>')
    # 四周散落的尘
    rng = random.Random(seed)
    dust = []
    for i in range(34):
        th = i * GOLDEN
        rr = r + size * (0.10 + 0.20 * rng.random())
        x = c + rr * math.cos(th)
        y = c + rr * math.sin(th)
        if math.hypot(x - c, y - c) > size * 0.47:
            continue
        dust.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{size*0.0075:.2f}" '
                    f'fill="{DAY_C2}" fill-opacity="{0.20 + 0.34*rng.random():.3f}"/>')
    orb_pts = dot_field(c, c, r * 0.94, 34, seed,
                        r_lo=size * 0.008, r_hi=size * 0.0135,
                        op_lo=0.40, op_hi=0.90)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="此刻">
  <defs>
    <radialGradient id="src" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="{NIGHT_C1}"/>
      <stop offset="62%" stop-color="{DAY_C2}"/>
      <stop offset="100%" stop-color="{NIGHT_C2}"/>
    </radialGradient>
  </defs>
  {chr(10).join("  " + h for h in halo)}
  {chr(10).join("  " + d for d in dust)}
  <circle cx="{c}" cy="{c}" r="{r}" fill="url(#src)"/>
  <g>
    {dots_svg(orb_pts)}
  </g>
</svg>'''


VARIANTS = {
    "mo": ("A · 墨球", logo_mo),
    "breath": ("B · 缺口环", logo_breath),
    "halo": ("C · 光源", logo_halo),
}


def main() -> None:
    out = Path("D:/ai/the_time/design/logo")
    out.mkdir(parents=True, exist_ok=True)
    for key, (label, fn) in VARIANTS.items():
        p = out / f"logo-{key}.svg"
        p.write_text(fn(), encoding="utf-8")
        print(f"{label:12s} -> {p}")


if __name__ == "__main__":
    main()
