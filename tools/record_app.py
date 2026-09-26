#!/usr/bin/env python
"""
驱动真实 app 录屏 —— 「此刻」演示视频的录制管线。

设计取舍（都是踩过的）：
  1. **不用逐帧截图**。Playwright 的 screenshot 单张约 100ms，连 10fps 都跑不动，
     而演示视频要 30fps 的动作。改用 CDP `Page.startScreencast` —— 浏览器自己推帧，
     实测 50fps+（帧间隔中位 17ms），且不受截图开销影响。
  2. **必须用 async API**。screencast 每帧要回一个 FrameAck，而 Playwright 的
     sync API 不允许在事件回调里再调 API（会死锁）。只有 async 的回调能 await。
  3. **帧率可变，必须按时间戳合成**。页面静止时 Chrome 仍按 ~60fps 推帧，
     但真实操作里会有停顿与掉帧，所以每帧记绝对时间戳，用 ffmpeg 的 concat
     demuxer 带 per-frame duration 合成，而不是假设固定 fps。
  4. **录的是真界面真操作**（真实点击 / 长按 / 输入），符合赛事「必须展示功能
     真实运行，禁止纯概念动画」的硬规则。所以这里不做任何视觉伪造。

用法：
    PY="C:/Users/guope/.workbuddy/binaries/python/envs/default/Scripts/python.exe"
    "$PY" tools/record_app.py --plan tools/shots/demo.json --work .tmp_record --out out/demo.mp4

镜头表（JSON 数组，一个元素 = 一个镜头）：
    [
      {
        "id": "shelf",
        "url": "?stage=discover&theme=day",     // 相对 BASE 的查询串
        "hydrate": 6000,                        // 导航后等数据落定（IndexedDB 是异步的）
        "lead": 600,                            // 开录后先空转一小段，给剪接留余量
        "acts": [
          {"wait": 900},
          {"tap": [195, 430]},                  // CSS 像素坐标
          {"longpress": [195, 760], "ms": 1100},
          {"type": "#watch", "text": "第一次"},
          {"wheel": 520},
          {"mark": "tap-volume"}                // 打点，输出到 marks.json 供配音对齐
        ]
      }
    ]
"""

import argparse
import asyncio
import base64
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
from playwright.async_api import async_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
BASE = "http://localhost:5173/"                # 由 --base 覆盖
VIEW = {"width": 390, "height": 844}          # iPhone 14 竖屏；≤430px 时机身退场、直接铺满
DSF = 2                                        # 录制用 780×1688；maxWidth 再决定最终宽度


# ── 录制器 ────────────────────────────────────────────────────────────────

class Recorder:
    """一次录屏会话。帧留在内存里，结束再落盘。"""

    def __init__(self, session, max_w=1080, max_h=2340, quality=90):
        self.sess = session
        self.max_w = max_w
        self.max_h = max_h
        self.quality = quality
        self.frames: list[str] = []
        self.stamps: list[float] = []
        self.marks: dict[str, float] = {}
        self.t0 = 0.0
        self._stop = False

    async def _on_frame(self, params):
        self.frames.append(params["data"])
        self.stamps.append(time.monotonic())
        try:
            await self.sess.send(
                "Page.screencastFrameAck", {"sessionId": params["sessionId"]}
            )
        except Exception:
            # 停止瞬间可能还有在途帧，ack 失败无所谓
            pass

    async def start(self):
        self.sess.on("Page.screencastFrame", self._on_frame)
        await self.sess.send(
            "Page.startScreencast",
            {
                "format": "jpeg",
                "quality": self.quality,
                "maxWidth": self.max_w,
                "maxHeight": self.max_h,
                "everyNthFrame": 1,
            },
        )
        self.t0 = time.monotonic()

    async def stop(self):
        await self.sess.send("Page.stopScreencast")

    def mark(self, name: str):
        self.marks[name] = round(time.monotonic() - self.t0, 3)

    def save(self, outdir: Path) -> dict:
        """帧写盘 + 生成 ffmpeg concat 清单。返回本段的元信息。"""
        if outdir.exists():
            shutil.rmtree(outdir)
        outdir.mkdir(parents=True, exist_ok=True)

        n = len(self.frames)
        if n == 0:
            raise RuntimeError("一帧都没收到——检查 screencast 是否真的启动、页面是否在渲染")

        for i, data in enumerate(self.frames):
            (outdir / f"f{i:05d}.jpg").write_bytes(base64.b64decode(data))

        # 每帧的显示时长 = 到下一帧的间隔；末帧给一个常见的帧时长兜底
        spans = []
        for i in range(n):
            if i < n - 1:
                spans.append(max(self.stamps[i + 1] - self.stamps[i], 1 / 120))
            else:
                spans.append(1 / 30)

        lines = ["ffconcat version 1.0"]
        for i, d in enumerate(spans):
            lines.append(f"file 'f{i:05d}.jpg'")
            lines.append(f"duration {d:.5f}")
        lines.append(f"file 'f{n - 1:05d}.jpg'")   # concat 需要末帧再出现一次才被计入
        (outdir / "list.txt").write_text("\n".join(lines), encoding="utf-8")

        return {
            "frames": n,
            "seconds": round(sum(spans), 3),
            "marks": self.marks,
            "dir": str(outdir),
        }


# ── 动作执行 ──────────────────────────────────────────────────────────────

async def run_acts(page, rec: Recorder, acts: list[dict]):
    """按镜头表执行真实操作。每个动作之间让事件循环喘口气，screencast 才收得到帧。"""
    for a in acts:
        if "wait" in a:
            await page.wait_for_timeout(int(a["wait"]))

        elif "tap" in a:
            x, y = a["tap"]
            await page.mouse.move(x, y)
            await page.mouse.down()
            await page.wait_for_timeout(60)
            await page.mouse.up()

        elif "longpress" in a:
            x, y = a["longpress"]
            ms = int(a.get("ms", 1100))
            await page.mouse.move(x, y)
            await page.wait_for_timeout(120)
            await page.mouse.down()
            await page.wait_for_timeout(ms)
            await page.mouse.up()

        elif "click" in a:
            await page.click(a["click"], timeout=8000)

        elif "type" in a:
            sel = a["type"]
            text = a.get("text", "")
            await page.click(sel, timeout=8000)
            # 一个字一个字打，画面里才有输入感；中文用 insert_text 一次成型
            if text.isascii():
                await page.type(sel, text, delay=int(a.get("delay", 90)))
            else:
                await page.fill(sel, text)

        elif "wheel" in a:
            # 滚轮的目标由鼠标位置决定，不先把指针放进内容区，滚的是空气
            if "at" in a:
                await page.mouse.move(*a["at"])
            else:
                vp = page.viewport_size or VIEW
                await page.mouse.move(vp["width"] / 2, vp["height"] / 2)
            await page.wait_for_timeout(80)
            # 分几步滚，避免一屏跳过去看不出过程
            total = int(a["wheel"])
            steps = int(a.get("steps", 8))
            for _ in range(steps):
                await page.mouse.wheel(0, total / steps)
                await page.wait_for_timeout(int(a.get("step_ms", 55)))

        elif "goto" in a:
            await page.goto(BASE + a["goto"], wait_until="load")
            await page.wait_for_timeout(int(a.get("hydrate", 5000)))

        elif "mark" in a:
            rec.mark(a["mark"])

        elif "eval" in a:
            await page.evaluate(a["eval"])

        else:
            raise ValueError(f"不认识的动作：{a}")


# ── 合成 ─────────────────────────────────────────────────────────────────

def encode(frames_dir: Path, out: Path, fps_cap: int = 0, scale: int = 2):
    """concat demuxer → mp4。

    两个必须显式处理的点：
      - **放大**：CDP screencast 的输出尺寸恒等于 CSS viewport（实测 390×844），
        deviceScaleFactor 对它不起作用。所以要用 lanczos 放大到发布尺寸。
      - **色彩范围**：mjpeg 是 full-range，不转 bt709 limited 的话成片会发灰。
    """
    out.parent.mkdir(parents=True, exist_ok=True)
    chain = []
    if scale and scale != 1:
        chain.append(f"scale=iw*{scale}:ih*{scale}:flags=lanczos")
    chain.append("scale=out_range=tv")
    if fps_cap:
        chain.append(f"fps={fps_cap}")
    cmd = [
        FFMPEG, "-y",
        "-f", "concat", "-safe", "0", "-i", str(frames_dir / "list.txt"),
        "-vf", ",".join(chain),
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", "60",
        "-r", "30",
        str(out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg 失败：\n" + (proc.stderr or "")[-2000:])


# ── 主流程 ────────────────────────────────────────────────────────────────

async def record_plan(plan: list[dict], work: Path, out: Path, max_w: int, keep: bool, scale: int = 2):
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            channel="chrome",
            headless=True,
            args=[
                "--hide-scrollbars",
                "--force-color-profile=srgb",
                "--autoplay-policy=no-user-gesture-required",
            ],
        )
        ctx = await browser.new_context(
            viewport=VIEW,
            device_scale_factor=DSF,
            is_mobile=True,
            has_touch=True,
            locale="zh-CN",
        )
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print("  [pageerror]", e))

        for shot in plan:
            sid = shot["id"]
            print(f"▸ 镜头 {sid}")
            url = BASE + shot.get("url", "")
            await page.goto(url, wait_until="load")
            await page.wait_for_timeout(int(shot.get("hydrate", 6000)))

            session = await ctx.new_cdp_session(page)
            rec = Recorder(session, max_w=max_w)
            await rec.start()
            await page.wait_for_timeout(int(shot.get("lead", 500)))
            await run_acts(page, rec, shot.get("acts", []))
            await page.wait_for_timeout(int(shot.get("tail", 700)))
            await rec.stop()

            seg = work / f"frames_{sid}"
            meta = rec.save(seg)
            meta["id"] = sid
            meta["fps"] = round(meta["frames"] / meta["seconds"], 1) if meta["seconds"] else 0
            print(f"  {meta['frames']} 帧 / {meta['seconds']}s ≈ {meta['fps']} fps"
                  + (f"  打点 {meta['marks']}" if meta["marks"] else ""))
            results.append(meta)

            if not keep:
                pass  # 帧先留着——合成失败时还要重来，work 目录统一由调用方清理

        await browser.close()

    # 单个镜头：直接出片；多个镜头：各出一段，交给上层拼
    if len(results) == 1:
        encode(Path(results[0]["dir"]), out, scale=scale)
        print(f"✔ {out}")
    else:
        for r in results:
            seg_out = out.with_name(f"{out.stem}_{r['id']}{out.suffix}")
            encode(Path(r["dir"]), seg_out, scale=scale)
            print(f"✔ {seg_out}")

    (work / "report.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return results


def main():
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True, help="镜头表 JSON")
    ap.add_argument("--base", default=BASE, help="被测站点根地址，默认 vite dev 的 5173")
    ap.add_argument("--work", default=".tmp_record", help="帧与中间产物目录")
    ap.add_argument("--out", required=True, help="输出 mp4")
    ap.add_argument("--max-width", type=int, default=1080)
    ap.add_argument("--scale", type=int, default=2,
                    help="输出放大倍数。screencast 的原生尺寸恒等于 CSS viewport（如 390×844），"
                         "deviceScaleFactor 对它无效，所以靠这里放大到发布尺寸。")
    ap.add_argument("--keep", action="store_true", help="保留帧（默认保留，调试用）")
    args = ap.parse_args()

    plan = json.loads(Path(args.plan).read_text(encoding="utf-8"))
    BASE = args.base.rstrip("/") + "/"
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    started = time.time()
    asyncio.run(record_plan(plan, work, Path(args.out), args.max_width, args.keep, args.scale))
    print(f"用时 {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
