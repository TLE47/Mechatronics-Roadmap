#!/usr/bin/env python3
"""Write the lesson text the workbench renders beside the editor.

The runner has always shown *code* — starter, hints, checks, output — and sent a learner to GitHub
for the words that explain them. That is two tabs and a scroll position lost on every lesson switch.
This generator copies each entry's page into `app/public/lesson-pages/`, one JSON file per page, so
the reader can put the explanation on the left and the editor on the right.

What it copies, and what it deliberately does not:

- **The lesson's own structure**: headings (h2-h4), paragraphs, nested lists, tables, fenced code,
  blockquotes (the safety notes), images and display maths. Inline Markdown stays Markdown here; the
  renderer parses it once, in TypeScript, so this file never grows a second idea of emphasis.
- **Not the generated callouts.** The "Run this in the workbench" block, the "Try this" link, the
  "Next:" line and the ladder-gate exam are written into every page by other scripts. The reader is
  already the workbench, so the callout would be a link to where the learner is standing; the exam is
  one paper on every page of a ladder and would dwarf the lesson.
- **Not the full solution.** The workbench locks the answer behind Load Solution on purpose, and a
  reading pane that printed it in an open `<details>` would unlock it through another door. The
  section is skipped, and the reader's footer says where the answer lives.
- **Not Mermaid.** The app has no Mermaid renderer; a flowchart's source between fences reads as
  noise. Those fences are dropped rather than shown as code.

The page list is the registry's own (`generate_python_lessons_data.build_lessons`), not a glob: an
entry whose `readerPath` is empty has no page and must not appear as a file, and an exercise package
reads the module that set it. `--check` fails when any committed file differs from what its page says
now, or when a file exists for a page the registry no longer lists.

Usage
    python3 scripts/generate_lesson_pages.py             # write app/public/lesson-pages/
    python3 scripts/generate_lesson_pages.py --check     # exit 1 when stale
    python3 scripts/generate_lesson_pages.py --stats     # counts and sizes, write nothing
"""

import argparse
import gzip
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "app", "public", "lesson-pages")
PAYLOAD_VERSION = 1

sys.path.insert(0, os.path.join(ROOT, "scripts"))
import generate_python_lessons_data as registry  # noqa: E402

# A marker pair wraps text a script writes into every page. Removed with its content, for the same
# reason `generate_prose_index.py` removes it: it is about the app, not about the lesson.
GENERATED_BLOCKS = [
    re.compile(r"<!--\s*run-callout:start\s*-->.*?<!--\s*run-callout:end\s*-->", re.S),
    re.compile(r"<!--\s*next-step:start\s*-->.*?<!--\s*next-step:end\s*-->", re.S),
    re.compile(r"<!--\s*try-link:start\s*-->.*?<!--\s*try-link:end\s*-->", re.S),
    re.compile(r"<!--\s*ladder-gate:start\s*-->.*?<!--\s*ladder-gate:end\s*-->", re.S),
]
COMMENT = re.compile(r"<!--.*?-->", re.S)
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
FENCE = re.compile(r"^\s{0,3}(```|~~~)\s*([A-Za-z0-9_+-]*)\s*$")
LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
TABLE_LINE = re.compile(r"^\s*\|")
TABLE_RULE = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")
RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
MATH_OPEN = re.compile(r"^\s*\$\$\s*$")
IMAGE_ONLY = re.compile(r"^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)\s*$")
HTML_IMG = re.compile(r"^\s*<img\s+[^>]*src=\"([^\"]+)\"[^>]*alt=\"([^\"]*)\"[^>]*>\s*$", re.I)
HTML_IMG_ALT_AFTER = re.compile(
    r"^\s*<img\s+[^>]*src=\"([^\"]+)\"[^>]*>$", re.I
)
DETAILS_LINE = re.compile(r"^\s*</?(?:details|summary)(?:\s[^>]*)?>\s*$", re.I)
# HTML the pages actually use, and only that: `<https://…>` is an autolink to the renderer, and a
# blanket tag strip would delete the URL. `<details>` and `<summary>` are dropped by line below.
KNOWN_TAG = (
    r"</?(?:br|hr|img|kbd|sub|sup|span|div|p|a|em|strong|b|i|code|pre|table|thead|tbody|tr|td|th"
    r"|details|summary|figure|figcaption|blockquote|ul|ol|li|h[1-6])\b[^>]*>"
)
TAG_LINE = re.compile(r"^\s*%s\s*$" % KNOWN_TAG, re.I)
TAG = re.compile(KNOWN_TAG, re.I)
BR = re.compile(r"<br\s*/?>", re.I)
SOLUTION_HEADING = re.compile(r"^full solution\b", re.I)
MERMAID = {"mermaid"}


def entries():
    """`[{id, path, readerPath}]` for every registry entry, in the order the runner lists them."""
    rows = []
    seen = set()
    for lesson in registry.build_lessons():
        path = lesson.get("readerPath") or ""
        if not path or path in seen:
            continue
        seen.add(path)
        rows.append({"id": lesson["id"], "path": path})
    return rows


def frontmatter(raw):
    """The frontmatter block's text, or '' when the page has none."""
    if not raw.startswith("---"):
        return ""
    end = raw.find("\n---", 4)
    return raw[4:end] if end >= 0 else ""


def body_of(raw):
    """The page without its frontmatter."""
    if not raw.startswith("---"):
        return raw
    end = raw.find("\n---", 4)
    return raw[end + 4 :] if end >= 0 else raw


def title_of(raw, fallback):
    for line in frontmatter(raw).split("\n"):
        key, sep, value = line.partition(":")
        if sep and key.strip() == "title":
            return value.strip().strip('"').strip("'") or fallback
    return fallback


def clean_inline(text):
    """One line without the HTML that a reading pane cannot draw.

    Inline Markdown is left alone: the renderer parses it, and stripping here would make the payload
    a second, weaker Markdown implementation.
    """
    text = BR.sub("\n", text)
    text = TAG.sub("", text)
    return text.strip()


def split_row(line):
    """A table row as cells, keeping escaped pipes and inline code intact."""
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    cells, current, escaped, in_code = [], [], False, False
    for char in line:
        if escaped:
            current.append(char)
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == "`":
            in_code = not in_code
            current.append(char)
            continue
        if char == "|" and not in_code:
            cells.append("".join(current).strip())
            current = []
            continue
        current.append(char)
    cells.append("".join(current).strip())
    return cells


def parse_blocks(raw):
    """The page as reader blocks, in order.

    Block types are deliberately few: what a lesson page actually uses. Each one is pinned by a
    fixture in `tests/test_lesson_pages.py`, so a construct the renderer does not know fails there
    rather than appearing as raw Markdown in the pane.
    """
    for pattern in GENERATED_BLOCKS:
        raw = pattern.sub("", raw)
    raw = COMMENT.sub("", raw)
    lines = body_of(raw).split("\n")

    blocks = []
    paragraph = []
    skip_level = 0  # inside a "Full Solution" section: skip until a heading this level or above

    def flush_paragraph():
        nonlocal paragraph
        text = "\n".join(paragraph).strip()
        paragraph = []
        if not text:
            return
        image = IMAGE_ONLY.match(text)
        if image:
            blocks.append({"t": "img", "src": image.group(2), "alt": image.group(1).strip()})
            return
        html_image = HTML_IMG.match(text) or HTML_IMG_ALT_AFTER.match(text)
        if html_image:
            groups = html_image.groups()
            alt = groups[1] if len(groups) > 1 else ""
            blocks.append({"t": "img", "src": groups[0], "alt": alt.strip()})
            return
        blocks.append({"t": "p", "x": text})

    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()

        fence = FENCE.match(line)
        if fence:
            flush_paragraph()
            marker = fence.group(1)
            language = fence.group(2).lower()
            code = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith(marker):
                code.append(lines[index])
                index += 1
            index += 1
            text = "\n".join(code).rstrip("\n")
            if language in MERMAID or skip_level:
                continue
            blocks.append({"t": "code", "lang": language, "text": text})
            continue

        if not stripped:
            flush_paragraph()
            index += 1
            continue

        if MATH_OPEN.match(line):
            flush_paragraph()
            tex = []
            index += 1
            while index < len(lines) and not MATH_OPEN.match(lines[index]):
                tex.append(lines[index])
                index += 1
            index += 1
            if not skip_level:
                blocks.append({"t": "math", "tex": "\n".join(tex).strip()})
            continue

        if DETAILS_LINE.match(line) or TAG_LINE.match(line):
            flush_paragraph()
            index += 1
            continue

        heading = HEADING.match(line)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            text = clean_inline(heading.group(2))
            if SOLUTION_HEADING.match(text):
                # The answer stays behind Load Solution, which is the editor's door.
                skip_level = level
                index += 1
                continue
            if skip_level and level <= skip_level:
                skip_level = 0
            if level >= 2 and not skip_level:
                blocks.append({"t": "h", "l": level, "x": text})
            index += 1
            continue

        if RULE.match(line):
            flush_paragraph()
            index += 1
            continue

        if TABLE_LINE.match(line):
            flush_paragraph()
            rows = []
            while index < len(lines) and TABLE_LINE.match(lines[index]):
                rows.append(lines[index])
                index += 1
            if skip_level or len(rows) < 2:
                continue
            head = [clean_inline(cell) for cell in split_row(rows[0])]
            body = [
                [clean_inline(cell) for cell in split_row(row)]
                for row in rows[1:]
                if not TABLE_RULE.match(row)
            ]
            blocks.append({"t": "table", "head": head, "rows": body})
            continue

        item = LIST_ITEM.match(line)
        if item:
            flush_paragraph()
            ordered = not item.group(2)[0] in "-*+"
            base_indent = len(item.group(1))
            items = []
            while index < len(lines):
                current = LIST_ITEM.match(lines[index])
                if current:
                    indent = len(current.group(1))
                    depth = max(0, (indent - base_indent) // 2)
                    items.append({"x": clean_inline(current.group(3)), "d": depth})
                    index += 1
                    continue
                # A wrapped line that belongs to the item above it: keep it in that item.
                if (
                    lines[index].strip()
                    and lines[index][:1].isspace()
                    and not lines[index].strip().startswith(("```", "~~~", "|"))
                    and items
                ):
                    items[-1]["x"] = (items[-1]["x"] + " " + clean_inline(lines[index])).strip()
                    index += 1
                    continue
                break
            if not skip_level:
                blocks.append({"t": "ol" if ordered else "ul", "items": items})
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            quoted = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quoted.append(re.sub(r"^\s*>\s?", "", lines[index]))
                index += 1
            text = "\n".join(quoted).strip()
            if text and not skip_level:
                # A blank `>` line is a paragraph break inside the callout, not one long quote.
                for chunk in re.split(r"\n\s*\n", text):
                    if chunk.strip():
                        blocks.append({"t": "quote", "x": chunk.strip()})
            continue

        if skip_level:
            index += 1
            continue

        paragraph.append(clean_inline(line))
        index += 1

    flush_paragraph()
    # A drop caused by a heading at the file's end must not leak into the next page: this parser is
    # per page, so there is nothing to reset, but a leading junk block would still be one block.
    return [block for block in blocks if block.get("t") != "code" or block.get("text")]


def payload_for(path):
    """One page's reader payload, or None when its file is missing."""
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        return None
    with open(full, encoding="utf-8") as handle:
        raw = handle.read()
    title = title_of(raw, path)
    return {
        "v": PAYLOAD_VERSION,
        "path": path,
        "title": title,
        "blocks": parse_blocks(raw),
    }


def output_path(page_path):
    """`track-p/P.1-…md` -> `<OUT_DIR>/track-p/P.1-….json`."""
    return os.path.join(OUT_DIR, page_path[: -len(".md")] + ".json")


def render(payload):
    """Minified, but one block per line: a diff names the paragraph that moved."""
    head = json.dumps(
        {key: payload[key] for key in ("v", "path", "title")},
        ensure_ascii=False,
        separators=(",", ":"),
    )[:-1]
    blocks = ",\n".join(
        json.dumps(block, ensure_ascii=False, separators=(",", ":")) for block in payload["blocks"]
    )
    return f'{head},"blocks":[\n{blocks}\n]}}\n'


def files():
    """`{relative path: rendered text}` for every page the registry lists."""
    produced = {}
    for row in entries():
        payload = payload_for(row["path"])
        if payload is None:
            raise SystemExit(f"{row['id']} names {row['path']}, which is not on disk")
        produced[row["path"][: -len(".md")] + ".json"] = render(payload)
    return produced


def committed():
    """`{relative path: text}` for every committed payload, keyed like `files()`."""
    found = {}
    if not os.path.isdir(OUT_DIR):
        return found
    for folder, _dirs, names in os.walk(OUT_DIR):
        for name in names:
            if not name.endswith(".json"):
                continue
            full = os.path.join(folder, name)
            with open(full, encoding="utf-8") as handle:
                found[os.path.relpath(full, OUT_DIR)] = handle.read()
    return found


def write(produced):
    """Write every payload, and remove files for pages the registry no longer lists."""
    for relative, text in produced.items():
        full = os.path.join(OUT_DIR, relative)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as handle:
            handle.write(text)
    removed = 0
    for relative in committed():
        if relative not in produced:
            os.remove(os.path.join(OUT_DIR, relative))
            removed += 1
    return removed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit 1 when a payload is stale")
    parser.add_argument("--stats", action="store_true", help="counts and sizes, write nothing")
    args = parser.parse_args()

    produced = files()
    raw = sum(len(text.encode("utf-8")) for text in produced.values())
    packed = sum(len(gzip.compress(text.encode("utf-8"), 9)) for text in produced.values())
    blocks = sum(
        len(json.loads(text)["blocks"]) for text in produced.values()
    )

    if args.stats:
        print(
            f"{len(produced)} pages, {blocks} blocks, {raw / 1024:.1f} kB raw, "
            f"{packed / 1024:.1f} kB gzipped across all pages"
        )
        return

    if args.check:
        have = committed()
        changed = sorted(name for name in produced if have.get(name) != produced[name])
        extra = sorted(name for name in have if name not in produced)
        if not changed and not extra:
            print(f"lesson pages are current: {len(produced)} pages, {packed / 1024:.1f} kB gzipped")
            return
        detail = ", ".join((changed + extra)[:5])
        print(
            f"lesson pages are stale: {len(changed)} changed, {len(extra)} no longer listed "
            f"({detail}). Run scripts/generate_lesson_pages.py.",
            file=sys.stderr,
        )
        sys.exit(1)

    removed = write(produced)
    print(
        f"wrote {len(produced)} lesson pages to {os.path.relpath(OUT_DIR, ROOT)} "
        f"({raw / 1024:.1f} kB raw, {packed / 1024:.1f} kB gzipped), removed {removed}"
    )


if __name__ == "__main__":
    main()
