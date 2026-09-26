#!/usr/bin/env python3
"""给 docs/html/ 下的手写 HTML 盖上「非核心」标记条。

文档分层约定（与 tools/md2doc.py 一致）：
    docs/*.md        —— 核心文档（权威源）
    docs/html/*.html —— 非核心阅读稿

本脚本用于 md2doc.py 管不到的手写页面（页顶插入一条内联样式的标记条，
不依赖页面自身 CSS）。文案按「上层目录是否存在同名 .md 源」自动切换：

    有 .md 源  -> 「本页是阅读稿，核心文档是 Markdown 源 …」
    无 .md 源  -> 「专题方案过程稿（仅存 HTML，无 Markdown 源）…」

可重复执行：旧的标记条（被 <!-- noncore-banner --> 包住的那段）会先被移除。

用法：
    python tools/mark_noncore.py docs/html/*.html
    python tools/mark_noncore.py --check docs/html/*.html   # 只报告，不写
"""

import re
import sys
from pathlib import Path

START = "<!-- noncore-banner -->"
END = "<!-- /noncore-banner -->"

OUTER = (
    "background:#efeae1;border-bottom:1px dashed #cdc3b2;padding:13px 24px;"
    "font-family:-apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"
)
BOX = (
    "max-width:1080px;margin:0 auto;display:flex;gap:10px;align-items:flex-start;"
    "font-size:13px;line-height:1.7;color:#7b7160"
)
TAG = (
    "flex:0 0 auto;background:#8b8479;color:#fff;border-radius:5px;"
    "padding:1px 8px;font-size:11.5px;letter-spacing:.12em"
)
CODE = "background:rgba(0,0,0,.055);border-radius:4px;padding:1px 5px;font-size:12.5px;color:#6b5525"

WITH_SRC = (
    "本页是阅读稿，<b>不是</b>权威源。核心文档是 Markdown 源 "
    "<code style=\"{code}\">{md}</code> —— 要改内容只改 <code style=\"{code}\">.md</code>，"
    "再用 <code style=\"{code}\">tools/md2doc.py</code> 重新生成本页。"
)
NO_SRC = (
    "本页是<b>专题方案过程稿</b>，只以 HTML 形式存在、没有 Markdown 源，属于过程记录，"
    '不代表现行结论 —— 现行定调基准见 <a href="05-下一版方向定调.html" '
    'style="color:#6b5525">05 · 下一版方向定调</a>。'
)


def banner(src_md: str | None) -> str:
    text = (
        WITH_SRC.format(code=CODE, md=src_md)
        if src_md
        else NO_SRC.format(code=CODE)
    )
    return (
        f'{START}\n<div style="{OUTER}">\n'
        f'  <div style="{BOX}">'
        f'<span style="{TAG}">非核心</span><span>{text}</span>'
        f"</div>\n</div>\n{END}\n"
    )


# 页面名与 md 源不同名时的对应关系
ALIAS = {"项目入口": "README.md"}


def find_md(html_path: Path) -> str | None:
    """在页面自身目录及上两级目录里找同名 .md，返回相对本页的路径。"""
    name = ALIAS.get(html_path.stem, html_path.stem + ".md")
    for depth, base in enumerate(
        (html_path.parent, html_path.parent.parent, html_path.parent.parent.parent)
    ):
        if (base / name).is_file():
            return "../" * depth + name
    return None


def apply(html_path: Path, check: bool = False) -> str:
    html = html_path.read_text(encoding="utf-8")
    html = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n?", "", html, flags=re.S)
    if START in html:
        return f"SKIP  {html_path.name}  (标记条无法定位，请手动检查)"

    md = find_md(html_path)
    m = re.search(r"<body[^>]*>\n?", html)
    if not m:
        return f"SKIP  {html_path.name}  (找不到 <body>)"

    bar = banner(md)
    out = html[: m.end()] + bar + html[m.end() :]
    if check:
        return f"CHECK {html_path.name}  -> {'有 md 源 ' + str(md) if md else '无 md 源（过程稿）'}"
    html_path.write_text(out, encoding="utf-8")
    return f"OK    {html_path.name}  -> {'有 md 源' if md else '无 md 源（过程稿）'}"


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--check"]
    check = "--check" in sys.argv
    if not args:
        print(__doc__)
        return 2
    for raw in args:
        p = Path(raw)
        if not p.is_file():
            print(f"MISS  {raw}")
            continue
        print(apply(p, check))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
