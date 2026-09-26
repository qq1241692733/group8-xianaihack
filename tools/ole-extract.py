#!/usr/bin/env python3
"""从 OLE 复合文档里抠出图片和正文（.wps / .doc / .ppt 这类老二进制格式）。

用法：
    python tools/ole-extract.py <输入文件> <输出目录> [--width 760] [--quality 80]

为什么要单独写这个：
    微信收到的「前端ui设计3(1).wps」这类文件，正文流只有 104 个字符，
    49 MB 全在 `Data` 流里 —— 里面根本没有文档，是一张张截图。
    走 Office 通道既慢又容易翻车（本机 editor_sdk 就会把它按 magic bytes
    误判成 sheet，然后报 "No workbook open"）。直接解 OLE 最省事，
    而且不需要装 Office / WPS / LibreOffice。

依赖：olefile、Pillow
    "C:/Users/guope/.workbuddy/binaries/python/envs/default/Scripts/pip.exe" install olefile pillow
"""

from __future__ import annotations

import argparse
import io
import os
import re
import struct
import sys

try:
    import olefile
except ImportError:  # pragma: no cover
    sys.exit("缺少 olefile：pip install olefile")

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("缺少 Pillow：pip install pillow")

Image.MAX_IMAGE_PIXELS = None

# 常见位图签名 -> 扩展名
SIGS = [
    (b"\xff\xd8\xff", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", ".png"),
    (b"GIF87a", ".gif"),
    (b"GIF89a", ".gif"),
]


def ole_streams(path: str) -> dict[str, bytes]:
    """返回 {流名: bytes}；只关心顶层流。"""
    out: dict[str, bytes] = {}
    with olefile.OleFileIO(path) as ole:
        for entry in ole.listdir(streams=True, storages=False):
            name = "/".join(entry)
            try:
                out[name] = ole.openstream(name).read()
            except Exception:
                pass
    return out


def extract_text(streams: dict[str, bytes]) -> str:
    """Word 97 二进制正文：FIB -> Clx -> piece table。失败就返回空串。"""
    wd = streams.get("WordDocument")
    if not wd or len(wd) < 0x01AA:
        return ""

    fib_flags = struct.unpack_from("<H", wd, 0x0A)[0]
    tbl_name = "1Table" if (fib_flags >> 9) & 1 else "0Table"
    tbl = streams.get(tbl_name)
    if not tbl:
        return ""

    fc_clx, lcb_clx = struct.unpack_from("<II", wd, 0x01A2)
    clx = tbl[fc_clx : fc_clx + lcb_clx]

    # Clx = [Prc]* Pcdt；Prc 以 0x01 开头（含长度），Pcdt 以 0x02 开头
    i, pcdt = 0, None
    while i < len(clx):
        tag = clx[i]
        if tag == 0x01:
            cb = struct.unpack_from("<h", clx, i + 1)[0]
            i += 3 + cb
        elif tag == 0x02:
            lcb = struct.unpack_from("<I", clx, i + 1)[0]
            pcdt = clx[i + 5 : i + 5 + lcb]
            break
        else:
            break
    if not pcdt:
        return ""

    n = (len(pcdt) - 4) // 12
    cps = [struct.unpack_from("<I", pcdt, 4 * k)[0] for k in range(n + 1)]
    parts: list[str] = []
    for k in range(n):
        off = 4 * (n + 1) + 8 * k
        fc = struct.unpack_from("<I", pcdt, off + 2)[0]
        compressed = bool(fc & 0x40000000)
        fcv = fc & 0x3FFFFFFF
        length = cps[k + 1] - cps[k]
        if compressed:
            raw = wd[fcv // 2 : fcv // 2 + length]
            parts.append(raw.decode("cp1252", "replace"))
        else:
            raw = wd[fcv : fcv + length * 2]
            parts.append(raw.decode("utf-16-le", "replace"))
    return "".join(parts)


def carve_images(streams: dict[str, bytes], outdir: str, width: int = 0, quality: int = 80):
    """在流里扫位图签名，按「下一个同类签名」截断，Pillow 能解码才留下。"""
    os.makedirs(outdir, exist_ok=True)
    saved: list[tuple[int, int, int, str]] = []  # (序号, 原流, 字节数, 文件名)

    for sname, data in streams.items():
        for sig, ext in SIGS:
            starts = [m.start() for m in re.finditer(re.escape(sig), data)]
            if not starts:
                continue
            for idx, start in enumerate(starts):
                nxt = starts[idx + 1] if idx + 1 < len(starts) else len(data)
                blob = data[start:nxt]
                end = blob.rfind(b"\xff\xd9") if ext == ".jpg" else -1
                if ext == ".jpg":
                    if end == -1:
                        continue
                    blob = blob[: end + 2]
                try:
                    im = Image.open(io.BytesIO(blob))
                    im.load()
                except Exception:
                    continue
                if width and im.width > width:
                    im = im.convert("RGB").resize(
                        (width, round(im.height * width / im.width)), Image.LANCZOS
                    )
                n = len(saved) + 1
                fn = os.path.join(outdir, f"{n:03d}{ext}")
                im.save(fn, quality=quality, optimize=True)
                saved.append((n, start, len(blob), fn))

    return saved


def main() -> int:
    ap = argparse.ArgumentParser(description="从 OLE 复合文档提取图片与正文")
    ap.add_argument("src", help="输入文件（.wps / .doc / .ppt …）")
    ap.add_argument("outdir", help="图片输出目录")
    ap.add_argument("--width", type=int, default=760, help="图片缩放宽（0=原图，默认 760）")
    ap.add_argument("--quality", type=int, default=80, help="JPEG 质量（默认 80）")
    ap.add_argument("--text", action="store_true", help="同时把正文写到 outdir/_text.txt")
    args = ap.parse_args()

    streams = ole_streams(args.src)
    print("流：", " · ".join(f"{k}({len(v):,})" for k, v in streams.items()))

    text = extract_text(streams)
    if text:
        body = text.replace("\r", "\n").replace("\x07", "｜")
        printable = sum(1 for ch in body if ch.isprintable() and ch not in "\n")
        print(f"正文：{len(text)} 字符（其中可打印 {printable}）")
        if args.text:
            os.makedirs(args.outdir, exist_ok=True)
            with open(os.path.join(args.outdir, "_text.txt"), "w", encoding="utf-8") as fh:
                fh.write(body)

    saved = carve_images(streams, args.outdir, args.width, args.quality)
    total = sum(s[2] for s in saved)
    print(f"图片：{len(saved)} 张，共 {total / 1024 / 1024:.1f} MB -> {args.outdir}")
    return 0 if saved else 1


if __name__ == "__main__":
    raise SystemExit(main())
