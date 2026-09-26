#!/usr/bin/env python3
"""把核心 Markdown 文档渲染成 HTML 阅读稿（单文件、零外部依赖、双击即开）。

文档分层约定：
    docs/*.md        —— 核心文档（权威源，改内容只改这里）
    docs/html/*.html —— 非核心阅读稿（由本脚本生成，页顶自动带「非核心」标记条）

用法：
    python tools/md2doc.py <input.md> <output.html> <kicker> [footer] \
        [--profile docs|root] [--noncore "自定义标记文案"]

约定（与 md 源码一一对应，不做额外加工）：
    - H1 之后的第一段（正文段或引用块）作为页面 lead
    - `## 一、标题` 里的中文序号拆进 <span class="n">
    - 表格 / 代码块 / 列表 / 引用块 原样映射
    - 结尾以 `**上一篇**` 或 `**回到索引**` 开头的段落渲染成页脚导航
    - 正文里的 .md 链接自动改写成 .html（用户在 Windows 上打不开 md）
    - 相对链接按输出位置自动重算（html 比 md 深一层，见 PROFILE_UP）
"""

import argparse
import html as H
import re
import sys
from pathlib import Path

# 输出位置相对 md 所在目录的深度：docs/x.md -> docs/html/x.html 深一层；
# 根 README.md -> docs/html/项目入口.html 深两层。
PROFILE_UP = {"docs": 1, "root": 2}
PROFILE = "docs"

CSS = """
:root{
  --bg:#f7f5f1;
  --paper:#fffdfa;
  --ink:#26231f;
  --ink-2:#5a544c;
  --ink-3:#8b8479;
  --rule:#e5e0d6;
  --gold:#a97c2c;
  --gold-bg:#fbf4e6;
  --code-bg:#f2efe9;
  --serif:"Source Han Serif SC","Noto Serif SC","Songti SC","STSong","SimSun",Georgia,serif;
  --sans:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  --mono:"JetBrains Mono","Cascadia Mono",Consolas,"Courier New",monospace;
}
*{box-sizing:border-box}
body{
  margin:0;background:var(--bg);color:var(--ink);
  font-family:var(--sans);font-size:16px;line-height:1.85;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:820px;margin:0 auto;padding:64px 28px 120px}

header{border-bottom:1px solid var(--rule);padding-bottom:30px;margin-bottom:14px}
.kicker{font-family:var(--serif);font-size:13px;letter-spacing:.34em;color:var(--gold);margin-bottom:20px}
h1{font-family:var(--serif);font-weight:500;font-size:38px;line-height:1.28;
   letter-spacing:.01em;margin:0 0 18px}
.lead{font-size:16.5px;color:var(--ink-2);line-height:1.9;margin:0}
.lead em{font-style:normal;color:var(--gold);border-bottom:1px solid rgba(169,124,44,.3)}
.lead strong{color:var(--ink);font-weight:600}

nav{background:var(--paper);border:1px solid var(--rule);border-radius:12px;
    padding:20px 24px;margin:30px 0 46px}
nav .t{font-family:var(--serif);font-size:13px;letter-spacing:.24em;color:var(--ink-3);margin-bottom:12px}
nav ol{margin:0;padding-left:20px;columns:2;column-gap:34px}
nav li{margin:5px 0;font-size:14.5px}
nav a{color:var(--ink-2);text-decoration:none;border-bottom:1px solid transparent;transition:.2s}
nav a:hover{color:var(--gold);border-bottom-color:rgba(169,124,44,.35)}

h2{font-family:var(--serif);font-weight:500;font-size:25px;line-height:1.4;
   margin:60px 0 20px;padding-top:26px;border-top:1px solid var(--rule)}
h2 .n{color:var(--gold);font-size:16px;letter-spacing:.1em;margin-right:12px;vertical-align:middle}
h3{font-family:var(--serif);font-weight:500;font-size:19px;margin:38px 0 14px;color:var(--ink)}
p{margin:0 0 18px;color:var(--ink-2)}
p strong,li strong{color:var(--ink);font-weight:600}
a{color:var(--gold)}

table{width:100%;border-collapse:collapse;margin:22px 0;font-size:14.5px}
th{text-align:left;font-family:var(--serif);font-weight:500;font-size:14px;
   color:var(--ink-3);letter-spacing:.08em;padding:10px 12px;border-bottom:1.5px solid var(--rule)}
td{padding:11px 12px;border-bottom:1px solid var(--rule);color:var(--ink-2);vertical-align:top}
td:first-child{color:var(--ink);white-space:nowrap}
tr:hover td{background:rgba(169,124,44,.035)}

code{font-family:var(--mono);font-size:13.5px;background:var(--code-bg);
     padding:2px 6px;border-radius:4px;color:#7a5a1c}
pre{background:var(--code-bg);border-left:3px solid var(--gold);border-radius:0 10px 10px 0;
    padding:18px 22px;overflow-x:auto;margin:20px 0}
pre code{background:none;padding:0;color:#3a352e;font-size:13px;line-height:1.75}

.note{background:var(--gold-bg);border:1px solid rgba(169,124,44,.22);border-radius:12px;
      padding:18px 22px;margin:24px 0;font-size:15px;color:#6b5525}
.note b{color:var(--gold)}
.note p{margin:0 0 10px;font-size:15px;color:#6b5525}
.note p:last-child{margin:0}

ul,ol{padding-left:22px;margin:0 0 18px}
li{margin:7px 0;color:var(--ink-2)}

hr{border:none;height:1px;background:var(--rule);margin:40px 0}

figure{margin:26px 0}
figure img{width:100%;display:block;border-radius:12px;border:1px solid var(--rule)}
figure a{display:block}
figcaption{margin-top:10px;font-family:var(--serif);font-size:13px;color:var(--ink-3);
           letter-spacing:.04em;line-height:1.7;text-align:center}
figure.grid{display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:10px}
figure.grid img{border-radius:8px}
figure.grid figcaption{grid-column:1/-1}

.pager{margin-top:56px;padding-top:22px;border-top:1px solid var(--rule);
       font-family:var(--serif);font-size:14.5px;color:var(--ink-3);letter-spacing:.04em}
.pager a{text-decoration:none;border-bottom:1px solid rgba(169,124,44,.3)}

footer{margin-top:34px;padding-top:22px;border-top:1px solid var(--rule);
       font-size:13.5px;color:var(--ink-3);font-family:var(--serif);letter-spacing:.06em}

/* 非核心标记条：通栏条幅，本页是阅读稿、不是权威源 */
.noncore{background:#efeae1;border-bottom:1px dashed #cdc3b2;padding:13px 24px}
.noncore .in{max-width:820px;margin:0 auto;display:flex;gap:10px;
             align-items:flex-start;font-size:13px;line-height:1.7;color:#7b7160}
.noncore i{flex:0 0 auto;font-style:normal;background:#8b8479;color:#fff;
           border-radius:5px;padding:1px 8px;font-size:11.5px;letter-spacing:.12em}
.noncore code{background:rgba(0,0,0,.055);color:#6b5525;font-size:12.5px}
.noncore a{color:#7b7160;}
@media (max-width:640px){.noncore{padding:12px 18px}}

@media (max-width:640px){
  .wrap{padding:40px 20px 80px}
  h1{font-size:28px}
  nav ol{columns:1}
  table{font-size:13.5px}
  td:first-child{white-space:normal}
}
"""

CN_NUM = "一二三四五六七八九十"

# 中文标点后面不补空格（md 源码是硬换行，拼接时会带出多余空格）
NO_SPACE_BEFORE = "，。、；：！？）」』》】…—·"


def is_cjk(ch: str) -> bool:
    o = ord(ch)
    return 0x2E80 <= o <= 0x9FFF or 0x3000 <= o <= 0x303F or 0xFF00 <= o <= 0xFFEF


def join_lines(buf: list[str]) -> str:
    out = ""
    for raw in buf:
        text = raw.strip()
        if not text:
            continue
        if out and out[-1] not in NO_SPACE_BEFORE and text[0] not in NO_SPACE_BEFORE \
                and not (is_cjk(out[-1]) and is_cjk(text[0])):
            out += " "
        out += text
    return out


def to_html_link(url: str) -> str:
    """md 链接 -> html；相对路径按输出位置重算（html 比 md 深若干层）。"""
    if re.match(r"^(?:[a-zA-Z][a-zA-Z0-9+.\-]*:|#)", url):  # http: / mailto: / #锚点
        return url
    url = url[:-3] + ".html" if url.endswith(".md") else re.sub(r"\.md#", ".html#", url)
    up = PROFILE_UP.get(PROFILE, 0)
    if PROFILE == "root" and url.startswith("docs/html/"):
        # 根 README 指向阅读稿的链接：与自身阅读稿同处 docs/html/
        url = url[len("docs/html/"):]
    elif PROFILE == "root" and url.startswith("docs/"):
        # 根 README 的 docs/xxx 与 html 阅读稿同处 docs/html/
        url = url[len("docs/"):]
    elif PROFILE == "docs" and url.startswith("html/"):
        # docs/README.md 的 html/xxx 与自身阅读稿同处 docs/html/
        url = url[len("html/"):]
    elif url.startswith("../"):
        url = "../" * up + url
    elif PROFILE == "root":
        url = "../" * up + url  # 根 README 里相对根的路径（如 app/）
    return url


def to_html_asset(url: str) -> str:
    """md 里的图片相对路径 -> html。图片路径相对 md 所在目录，输出位置比 md 深 PROFILE_UP 层。"""
    if re.match(r"^(?:[a-zA-Z][a-zA-Z0-9+.\-]*:|/|#)", url):
        return url
    return "../" * PROFILE_UP.get(PROFILE, 0) + url


IMG_LINE = re.compile(r"^!\[([^\]]*)\]\(([^)\s]+)\)\s*$")


def render_figure(imgs: list[tuple[str, str]]) -> str:
    """一张图 -> 整幅 figure；连续 2~4 张 -> 网格。alt 兼作图注。"""
    if len(imgs) == 1:
        alt, src = imgs[0]
        cap = f"<figcaption>{inline(alt)}</figcaption>" if alt.strip() else ""
        return (
            f'<figure><img src="{to_html_asset(src)}" '
            f'alt="{H.escape(alt, quote=True)}" loading="lazy"/>{cap}</figure>'
        )
    cols = min(len(imgs), 4)
    cells = "".join(
        f'<img src="{to_html_asset(s)}" alt="{H.escape(a, quote=True)}" loading="lazy"/>'
        for a, s in imgs
    )
    caps = "、".join(a for a, _ in imgs if a.strip())
    cap = f"<figcaption>{inline(caps)}</figcaption>" if caps else ""
    return f'<figure class="grid" style="--cols:{cols}">{cells}{cap}</figure>'


def inline(text: str) -> str:
    """行内标记：先摘出 code span，再转义，最后还原。"""
    spans: list[str] = []

    def stash(m: re.Match) -> str:
        spans.append(m.group(1))
        return f"\x00{len(spans) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = H.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        lambda m: '<a href="%s">%s</a>' % (to_html_link(m.group(2)), m.group(1)),
        text,
    )
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", text)

    def unstash(m: re.Match) -> str:
        return "<code>" + H.escape(spans[int(m.group(1))], quote=False) + "</code>"

    return re.sub(r"\x00(\d+)\x00", unstash, text)


def split_row(line: str) -> list[str]:
    """按 | 分列，但跳过 code span 内的 |。"""
    cells, cur, tick = [], "", False
    for ch in line.strip().strip("|"):
        if ch == "`":
            tick = not tick
            cur += ch
        elif ch == "|" and not tick:
            cells.append(cur.strip())
            cur = ""
        else:
            cur += ch
    cells.append(cur.strip())
    return cells


def is_sep(line: str) -> bool:
    return bool(re.fullmatch(r"\|[\s:\-|]+\|", line.strip()))


def render_table(rows: list[list[str]]) -> str:
    out = ["<table>"]
    head, *body = rows
    out.append("<tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr>")
    for row in body:
        out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in row) + "</tr>")
    out.append("</table>")
    return "\n".join(out)


def parse(md: str):
    lines = md.split("\n")
    i = 0
    title = ""
    blocks: list[tuple[str, str]] = []  # (kind, html)
    toc: list[tuple[str, str]] = []

    def flush_para(buf: list[str]) -> None:
        if buf:
            text = join_lines(buf)
            if text:
                if re.match(r"^\*\*(上一篇|回到索引)", text):
                    blocks.append(("pager", f'<p class="pager">{inline(text)}</p>'))
                else:
                    blocks.append(("p", f"<p>{inline(text)}</p>"))
            buf.clear()

    para: list[str] = []
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()

        if line.startswith("```"):
            flush_para(para)
            i += 1
            code: list[str] = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            blocks.append(("pre", "<pre><code>%s</code></pre>" % H.escape("\n".join(code))))
            continue

        if not line.strip():
            flush_para(para)
            i += 1
            continue

        if line.startswith("# ") and not title:
            flush_para(para)
            title = line[2:].strip()
            i += 1
            continue

        m = re.match(r"^##\s+(.*)$", line)
        if m:
            flush_para(para)
            rest = m.group(1).strip()
            num = ""
            nm = re.match(r"^([" + CN_NUM + r"]+)[、.．]\s*(.+)$", rest)
            if nm:
                num, rest = nm.group(1), nm.group(2)
            else:
                nm = re.match(r"^(\d+(?:\.\d+)?)[、.．]\s*(.+)$", rest)
                if nm:
                    num, rest = nm.group(1), nm.group(2)
            sid = "s%d" % (len(toc) + 1)
            toc.append((sid, rest))
            span = f'<span class="n">{num}</span>' if num else ""
            blocks.append(("h2", f'<h2 id="{sid}">{span}{inline(rest)}</h2>'))
            i += 1
            continue

        m = re.match(r"^###\s+(.*)$", line)
        if m:
            flush_para(para)
            blocks.append(("h3", f"<h3>{inline(m.group(1).strip())}</h3>"))
            i += 1
            continue

        if IMG_LINE.match(line.strip()):
            flush_para(para)
            imgs: list[tuple[str, str]] = []
            while i < len(lines):
                m = IMG_LINE.match(lines[i].strip())
                if not m:
                    break
                imgs.append((m.group(1), m.group(2)))
                i += 1
            blocks.append(("figure", render_figure(imgs)))
            continue

        if re.fullmatch(r"-{3,}", line.strip()):
            flush_para(para)
            blocks.append(("hr", "<hr/>"))
            i += 1
            continue

        if line.startswith("|") and i + 1 < len(lines) and is_sep(lines[i + 1]):
            flush_para(para)
            rows = [split_row(line)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            blocks.append(("table", render_table(rows)))
            continue

        if line.startswith(">"):
            flush_para(para)
            quote: list[str] = []
            while i < len(lines) and lines[i].startswith(">"):
                quote.append(lines[i][1:].strip())
                i += 1
            body = join_lines(quote)
            blocks.append(("note", f'<div class="note">{inline(body)}</div>'))
            continue

        m = re.match(r"^[-*]\s+(.*)$", line)
        if m:
            flush_para(para)
            items = []
            while i < len(lines) and re.match(r"^[-*]\s+", lines[i]):
                items.append(re.sub(r"^[-*]\s+", "", lines[i]).strip())
                i += 1
            body = "".join(f"<li>{inline(x)}</li>" for x in items)
            blocks.append(("ul", f"<ul>{body}</ul>"))
            continue

        m = re.match(r"^\d+\.\s+(.*)$", line)
        if m:
            flush_para(para)
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i]):
                items.append(re.sub(r"^\d+\.\s+", "", lines[i]).strip())
                i += 1
            body = "".join(f"<li>{inline(x)}</li>" for x in items)
            blocks.append(("ol", f"<ol>{body}</ol>"))
            continue

        para.append(line)
        i += 1

    flush_para(para)

    lead = ""
    if blocks and blocks[0][0] in ("p", "note"):
        lead = blocks.pop(0)[1]
        if lead.startswith('<div class="note">'):
            lead = '<p class="lead">' + lead[len('<div class="note">') : -len("</div>")] + "</p>"
        else:
            lead = lead.replace("<p>", '<p class="lead">', 1)
    return title, lead, blocks, toc


def build(md_path: Path, kicker: str, footer: str, mark: str = "") -> str:
    title, lead, blocks, toc = parse(md_path.read_text(encoding="utf-8"))
    nav = ""
    if toc:
        items = "".join(f'<li><a href="#{sid}">{inline(t)}</a></li>' for sid, t in toc)
        nav = (
            '<nav>\n  <div class="t">目录</div>\n  <ol>\n    '
            + items
            + "\n  </ol>\n</nav>"
        )
    body = "\n\n".join(html for _, html in blocks)
    banner = (
        f'<div class="noncore"><div class="in"><i>非核心</i><span>{inline(mark)}</span></div></div>\n'
        if mark
        else ""
    )
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>此刻 · {H.escape(title)}</title>
<style>{CSS}</style>
</head>
<body>
{banner}<div class="wrap">

<header>
  <div class="kicker">{H.escape(kicker)}</div>
  <h1>{inline(title)}</h1>
  {lead}
</header>

{nav}

{body}

<footer>{H.escape(footer)}</footer>

</div>
</body>
</html>
"""


def main() -> int:
    global PROFILE
    ap = argparse.ArgumentParser(description="核心 md -> HTML 阅读稿（页顶自动标「非核心」）")
    ap.add_argument("src", help="核心 md 文件")
    ap.add_argument("dst", help="输出 html（通常在 docs/html/）")
    ap.add_argument("kicker", help="页眉小字，如「此刻 · 项目背景」")
    ap.add_argument("footer", nargs="?", default="", help="页脚，默认由 kicker 推导")
    ap.add_argument("--profile", choices=sorted(PROFILE_UP), default="docs",
                    help="输出位置相对 md 深几层：docs=1（默认），root=2")
    ap.add_argument("--noncore", default=None, help="自定义「非核心」标记文案")
    args = ap.parse_args()

    PROFILE = args.profile
    src, dst = Path(args.src), Path(args.dst)
    kicker = args.kicker
    footer = args.footer or kicker.replace(" · ", " ｜ ")
    if args.noncore is not None:
        mark = args.noncore
    else:
        mark = (
            "本页是阅读稿，**不是**权威源。核心文档是 Markdown 源 `%s%s` —— "
            "要改内容只改 `.md`，再用 `tools/md2doc.py` 重新生成本页。"
            % ("../" * PROFILE_UP[PROFILE], src.name)
        )
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(build(src, kicker, footer, mark), encoding="utf-8")
    print(f"OK  {src.name} -> {dst.as_posix()}  ({dst.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
