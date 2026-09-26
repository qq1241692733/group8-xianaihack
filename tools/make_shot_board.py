"""
把 app 的四态截图裁到手机框，拼成一张对比板。

- 手机框自动检测：先取四角背景色，找「整列/整行有大量像素偏离背景」的区间
  （手机机身高，阴影只是薄薄一圈，用「偏离像素占该列高度过半」就能滤掉阴影）。
- 输出 2×2 板，带标题行。
"""
import sys
from PIL import Image, ImageDraw, ImageFont

SRC = '.tmp_ui/final'
OUT_JPG = 'docs/shots/23-app-combos.jpg'
OUT_ONE = 'docs/shots/23-app-{}.jpg'

FILES = [
    ('1-shelf', '发现 · 册架（封面从内容长出来）'),
    ('2-volume', '发现 · 卷内（段序：声音→照片→一句话）'),
    ('3-chat-org', '对话 · 单册回执（草稿：留下 / 不要）'),
    ('4-chat-query', '对话 · 多册回执（行列表，点行原地展开）'),
]


def bg_of(im):
    return im.getpixel((3, 3))[:3]


def frame_box(im, thresh=6, frac=0.5):
    w, h = im.size
    bg = bg_of(im)
    px = im.convert('RGB').load()
    cols = [0] * w
    rows = [0] * h
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2])) > thresh:
                cols[x] += 1
                rows[y] += 1
    cmax, rmax = max(cols), max(rows)
    xs = [x for x in range(w) if cols[x] > frac * cmax]
    ys = [y for y in range(h) if rows[y] > frac * rmax]
    return (min(xs), min(ys), max(xs), max(ys))


def load_font(size):
    for p in (r'C:\Windows\Fonts\msyhbd.ttc', r'C:\Windows\Fonts\msyh.ttc',
              r'C:\Windows\Fonts\simhei.ttf'):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


# 检测框（四态同一布局，用第一张定框）
first = Image.open(f'{SRC}/{FILES[0][0]}.png').convert('RGB')
box = frame_box(first)
print('phone box =', box)

pad = 6
box = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
cw, ch = box[2] - box[0], box[3] - box[1]

# 每格缩到固定宽，拼 2×2
CELL_W = 620
scale = CELL_W / cw
CELL_H = int(ch * scale)

GAP = 34
LABEL_H = 62
title_font = load_font(30)
MARGIN = 46
board_w = MARGIN * 2 + CELL_W * 2 + GAP
board_h = MARGIN * 2 + (CELL_H + LABEL_H) * 2 + GAP
board = Image.new('RGB', (board_w, board_h), (244, 244, 244))
draw = ImageDraw.Draw(board)

for i, (name, label) in enumerate(FILES):
    im = Image.open(f'{SRC}/{name}.png').convert('RGB').crop(box).resize(
        (CELL_W, CELL_H), Image.LANCZOS)
    im.save(OUT_ONE.format(name), quality=92)
    col, row = i % 2, i // 2
    x = MARGIN + col * (CELL_W + GAP)
    y = MARGIN + row * (CELL_H + LABEL_H + GAP)
    board.paste(im, (x, y))
    draw.text((x, y + CELL_H + 14), label, fill=(40, 40, 44), font=title_font)

board.save(OUT_JPG, quality=90)
print('board ->', OUT_JPG, board.size)
