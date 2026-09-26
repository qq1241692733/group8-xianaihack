"""
「此刻」APK 图标生成 —— A · 墨球方向。

与 tools/make_logo.py 同一套算法（同 seed、同密度场），SVG 稿与图标视觉一致。
自适应图标：foreground 画布 108dp，球占中心 30%（安全区 66dp 内）；
普通图标：白底方形 / 圆形，球占 40%，小尺寸下更清楚。
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

RES = Path("D:/ai/the_time/app/android/app/src/main/res")

DAY_C1 = (0xB7, 0xCF, 0xFA)
DAY_C2 = (0x3A, 0x5E, 0xD6)
DAY_C3 = (0x1A, 0x40, 0x8C)
GOLDEN = 2.399963229728653
WHITE_BG = (255, 255, 255)


def density(u: float, v: float, power: float = 1.6, floor: float = 0.10) -> float:
    t = (u + v + 2.0) / 4.0
    t = min(1.0, max(0.0, t))
    return floor + (1.0 - floor) * (t ** power)


def dot_field(cx: float, cy: float, radius: float, n_target: int, seed: int,
              r_lo: float, r_hi: float, op_lo: float, op_hi: float,
              power: float = 1.6):
    rng = random.Random(seed)
    n_cand = int(n_target * 2.7)
    pts = []
    for i in range(n_cand):
        r = radius * math.sqrt((i + 0.5) / n_cand)
        th = i * GOLDEN
        x = cx + r * math.cos(th)
        y = cy + r * math.sin(th)
        d = density((x - cx) / radius, (y - cy) / radius, power)
        if rng.random() < d:
            pts.append((x, y, r_hi + (r_lo - r_hi) * d, op_lo + (op_hi - op_lo) * d))
    return pts


def lerp(a, b, t):
    return a + (b - a) * t


def gradient_color(t: float) -> tuple[int, int, int]:
    """0% #B7CFFA → 52% #3A5ED6 → 100% #1A408C"""
    if t <= 0.52:
        k = t / 0.52
        return tuple(int(round(lerp(a, b, k))) for a, b in zip(DAY_C1, DAY_C2))
    k = (t - 0.52) / 0.48
    return tuple(int(round(lerp(a, b, k))) for a, b in zip(DAY_C2, DAY_C3))


def draw_orb(size: int, r_ratio: float, seed: int = 7,
             bg: tuple[int, int, int] | None = None,
             circle_mask: bool = False) -> Image.Image:
    """画一颗墨球。r_ratio 是球半径 / 画布边长。"""
    c = size / 2
    r = size * r_ratio
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if bg is None else (*bg, 255))
    draw = ImageDraw.Draw(img)

    # 球体：radialGradient，焦点 34%/30%，半径 82%（与 SVG 一致，相对球 bbox）
    fx, fy = c - r + 0.34 * 2 * r, c - r + 0.30 * 2 * r   # bbox 左上 + 比例
    gr = r * 2 * 0.82
    px = img.load()
    x0, x1 = int(c - r) - 1, int(c + r) + 2
    y0, y1 = int(c - r) - 1, int(c + r) + 2
    for yy in range(max(0, y0), min(size, y1)):
        for xx in range(max(0, x0), min(size, x1)):
            dx, dy = xx - c, yy - c
            dist = math.hypot(dx, dy)
            if dist > r:
                continue
            t = min(1.0, math.hypot(xx - fx, yy - fy) / gr)
            col = gradient_color(t)
            # 边缘 1px 轻微抗锯齿
            alpha = 255
            if dist > r - 1:
                alpha = int(255 * (r - dist))
            px[xx, yy] = (*col, alpha)

    # 点阵：与 make_logo.py 的 logo_mo 完全同参数（seed=7, n=120）
    pts = dot_field(c, c, r * 0.94, 120, seed,
                    r_lo=size * 0.0055, r_hi=size * 0.0115,
                    op_lo=0.45, op_hi=0.92)
    # 点画在独立图层再叠加，保证透明度正确混合
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)
    for x, y, rad, op in pts:
        ldraw.ellipse((x - rad, y - rad, x + rad, y + rad), fill=(255, 255, 255, int(255 * op)))
    img = Image.alpha_composite(img, layer)

    if circle_mask and bg is not None:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def main() -> None:
    for dpi, k in DENSITIES.items():
        d = RES / f"mipmap-{dpi}"
        d.mkdir(parents=True, exist_ok=True)

        # 自适应图标前台层：108dp 画布，透明底，球 r=30%（安全区内）
        fg = draw_orb(int(108 * k), 0.30)
        fg.save(d / "ic_launcher_foreground.png")

        # 普通图标：白底方形 + 圆形，球 r=40%
        sq = draw_orb(int(48 * k), 0.40, bg=WHITE_BG)
        sq.save(d / "ic_launcher.png")
        rd = draw_orb(int(48 * k), 0.40, bg=WHITE_BG, circle_mask=True)
        rd.save(d / "ic_launcher_round.png")

        print(f"{dpi}: {int(108*k)}px fg / {int(48*k)}px launcher")

    # 品牌资产：512 与 1024 主 logo
    out = Path("D:/ai/the_time/design/logo")
    for s in (512, 1024):
        draw_orb(s, 0.30).save(out / f"logo-mo-{s}.png")
    print("brand PNG -> design/logo/")


if __name__ == "__main__":
    main()
