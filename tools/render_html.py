#!/usr/bin/env python
"""
HTML 动画页 → 逐帧渲染成 mp4（可 seek、可复现、高分辨率）。

和 tools/record_app.py 的分工：
  - record_app.py  录**真 app**：操作是真的（点击/长按/输入），只能用实时录屏，
                   因为 React + CSS spring 的动效无法 seek，而且必须避免伪造。
  - render_html.py 渲**我们自己写的 HTML**（标题卡 / 章节卡 / 数据页 / 收尾卡）：
                   页面暴露一个 `window.__seek(ms)` 接口，把动画交给一个可控时钟，
                   于是可以 1/30s 精确取帧 —— 帧率恒定、时间可复现、改文案重跑得到
                   一模一样的节奏。这是「PPT 式分页」部分该走的路。

为什么不用 screencast 渲自己的页：
  1. screencast 输出恒等于 CSS viewport（dsf 无效），只能后期放大；
     而 screenshot **认 deviceScaleFactor**，可以原生拿到 3 倍图（真高清）。
  2. screencast 是实时采样的，页面一旦卡顿就丢节奏；逐帧 seek 不受此影响。

页面契约（HTML 侧要提供）：
  window.__ready      —— 就绪标志
  window.__DURATION   —— 本页动画总时长（ms）
  window.__seek(t)    —— 把页面所有动画定位到第 t 毫秒
  （推荐实现：document.getAnimations().forEach(a => { a.pause(); a.currentTime = t });）

用法：
    PY="C:/Users/guope/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
    "$PY" tools/render_html.py --plan tools/shots/cards.json --work .tmp_record --out out/cards.mp4
"""

import argparse
import asyncio
import json
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

import imageio_ffmpeg
from playwright.async_api import async_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

DEFAULT_VIEW = {"width": 390, "height": 844}
DEFAULT_DSF = 3          # 3 倍图：390×844 → 1170×2532，真高清，不是放大出来的


# ── 单页渲染 ──────────────────────────────────────────────────────────────

async def render_card(page, card: dict, work: Path, out_w: int | None):
    """把一页 HTML 动画逐帧渲染成帧序列，返回元信息。"""
    cid = card["id"]
    url = card["url"]
    fps = int(card.get("fps", 30))

    await page.goto(url, wait_until="load")
    await page.wait_for_function("() => window.__ready === true", timeout=15000)
    await page.wait_for_timeout(int(card.get("settle", 300)))

    duration = int(card.get("duration") or await page.evaluate("() => window.__DURATION"))
    n = max(1, round(duration / 1000 * fps))
    hold = float(card.get("hold", 0))          # 末尾定格秒数（字幕读完用）
    n_hold = round(hold * fps)

    # ⚠️ 每次渲进一个带随机后缀的新目录，**绝不能 rmtree 旧目录**：
    #    运行时环境有批量删除守卫（一次删超过 50 个文件会被拦），
    #    而一卡就是上百个 PNG，必然触发。旧目录留着，由调用方按需清理。
    frames_dir = work / f"card_{cid}_{uuid.uuid4().hex[:8]}"
    frames_dir.mkdir(parents=True, exist_ok=True)

    for i in range(n):
        t = i / fps * 1000.0
        await page.evaluate("t => window.__seek(t)", t)
        # ⚠️ 不能传 animations="disabled"：它会把动画强制快进到终态，
        #    正好覆盖掉 __seek 设的 currentTime，结果是每一帧都长一样。
        await page.screenshot(path=str(frames_dir / f"f{i:05d}.png"))
    for j in range(n_hold):
        shutil.copyfile(frames_dir / f"f{n-1:05d}.png", frames_dir / f"f{n+j:05d}.png")

    total = n + n_hold
    return {
        "id": cid,
        "dir": str(frames_dir),
        "frames": total,
        "seconds": round(total / fps, 3),
        "fps": fps,
        "native": list(card.get("_native", [])),
    }


# ── 合成 ─────────────────────────────────────────────────────────────────

def encode_png_dir(frames_dir: Path, out: Path, fps: int, target_w: int | None):
    """PNG 序列 → mp4。PNG 是 sRGB full-range，同样要显式转 bt709，否则发灰。"""
    out.parent.mkdir(parents=True, exist_ok=True)
    chain = []
    if target_w:
        chain.append(f"scale={target_w}:-2:flags=lanczos")
    chain.append("scale=out_range=tv")
    cmd = [
        FFMPEG, "-y",
        "-framerate", str(fps),
        "-i", str(frames_dir / "f%05d.png"),
        "-vf", ",".join(chain),
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:v", "libx264", "-preset", "slow", "-crf", "17",
        "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-r", str(fps),
        str(out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg 失败：\n" + (proc.stderr or "")[-2000:])


def concat(parts: list[Path], out: Path, fps: int):
    """多卡首尾相接。各段必须先统一成同尺寸同编码才能 concat。"""
    lst = out.with_suffix(".txt")
    lst.write_text(
        "\n".join(f"file '{p.as_posix()}'" for p in parts), encoding="utf-8"
    )
    cmd = [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
           "-c", "copy", "-movflags", "+faststart", str(out)]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError("拼接失败：\n" + (proc.stderr or "")[-1500:])


# ── 主流程 ────────────────────────────────────────────────────────────────

async def render_plan(plan: list, work: Path, out: Path,
                      base: str, view: dict, dsf: int, target_w: int | None):
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            channel="chrome", headless=True,
            args=["--hide-scrollbars", "--force-color-profile=srgb",
                  "--autoplay-policy=no-user-gesture-required"],
        )
        ctx = await browser.new_context(viewport=view, device_scale_factor=dsf,
                                        locale="zh-CN")
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("  [pageerror]", e))

        for card in plan:
            cid = card["id"]
            if "base" in card:
                card["url"] = card["base"].rstrip("/") + "/" + card["url"].lstrip("/")
            elif not card["url"].startswith(("http", "file:")):
                card["url"] = base.rstrip("/") + "/" + card["url"].lstrip("/")

            print(f"▸ 卡片 {cid}  {card['url']}")
            meta = await render_card(page, card, work, target_w)
            meta["_out"] = str(out.with_name(f"{out.stem}_{cid}{out.suffix}"))
            print(f"  {meta['frames']} 帧 / {meta['seconds']}s @ {meta['fps']}fps")
            results.append(meta)

        await browser.close()

    parts = []
    for r in results:
        seg = Path(r["_out"])
        encode_png_dir(Path(r["dir"]), seg, r["fps"], target_w)
        parts.append(seg)
        print(f"✔ {seg}")

    if len(parts) > 1:
        concat(parts, out, results[0]["fps"])
        print(f"✔ 合成 {out}")

    (work / "cards_report.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True, help="卡片表 JSON")
    ap.add_argument("--base", default="", help="相对路径的根（file:///... 或 http://...）")
    ap.add_argument("--work", default=".tmp_record")
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=390)
    ap.add_argument("--height", type=int, default=844)
    ap.add_argument("--dsf", type=int, default=DEFAULT_DSF)
    ap.add_argument("--target-width", type=int, default=780,
                    help="成片宽度（各段统一），默认 780")
    args = ap.parse_args()

    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    work = Path(args.work); work.mkdir(parents=True, exist_ok=True)
    view = {"width": args.width, "height": args.height}
    t0 = time.time()
    asyncio.run(render_plan(plan, work, Path(args.out), args.base, view,
                            args.dsf, args.target_width))
    print(f"用时 {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
