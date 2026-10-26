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
- **Figures, by name.** A line `<!-- figure: signal-chain | One line about it -->` becomes a
  `figure` block: the app draws it from `app/src/visuals/scenes.ts`, so the picture is app code and
  the Markdown stays readable. The comment form is deliberate — GitHub hides it, so the page reads
  normally in the repository and shows the diagram in the workbench. Mermaid fences are still
  dropped (the app has no Mermaid renderer); a figure that needs a real diagram is a scene instead.

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
# 3 with `route` blocks (2 was `figure`): the reader's validator refuses a version it does not know
# rather than guessing at a shape that changed, and a lesson written before figures or routes reads
# the same.
PAYLOAD_VERSION = 3

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
# A Mermaid `flowchart`/`graph` is the route diagram nearly every page already carries. It is not
# drawn with Mermaid (a 300 kB renderer for a five-box chain): a single-chain flowchart is parsed
# into ordered steps and drawn by the app. Anything a `route` block cannot represent — branches,
# subgraphs, sequence or class diagrams — is still dropped rather than shown as source.
FLOW_HEADER = re.compile(r"^\s*(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\s*;?\s*$", re.I)
FLOW_TOKEN = re.compile(
    r"^([A-Za-z0-9_.\-]+)\s*(?:\[\s*\"?([^\"\]]*?)\"?\s*\]|\(\s*\"?([^\"\)]*?)\"?\s*\)|\{\s*\"?([^\"}]*?)\"?\s*\})?$"
)
FLOW_SKIP = re.compile(r"^\s*(?:%%|subgraph\b|end\b|style\b|classDef\b|class\b|linkStyle\b|click\b|direction\b)", re.I)
ROUTE_CAPTION = "Each box is a checkpoint in order; the last one is the verified pass this page ends on."


def _flow_node(token):
    """`(name, label, explicit)` for one Mermaid node, or None when the token is not a plain node.

    `explicit` says whether this occurrence carried a label: a later mention of a node (`B --> C`)
    names `B` again without repeating its text, and must not overwrite the label the first line gave
    it. That was a real bug: every label defined on the left of an arrow was replaced by its node id.
    """
    match = FLOW_TOKEN.match(token.strip().rstrip(";"))
    if not match:
        return None
    name = match.group(1)
    label = next((group for group in match.groups()[1:] if group is not None), "").strip()
    # `python_variables_and_types` is an identifier the page's own table uses; a reader does not
    # read underscores as spaces, so the label is de-underscored but nothing else is rewritten.
    return name, (label or name).replace("_", " "), bool(label)


def flow_route(text):
    """The steps of a single-chain flowchart, or None when it is not one.

    A route is only drawn when the graph *is* a route: one start, one end, no branches, no isolated
    nodes. That keeps the promise this replaces — a diagram that is not a line is not silently
    redrawn as one — while the 170 pages that already contain a line get a picture.
    """
    lines = [line for line in text.split("\n") if line.strip() and not FLOW_SKIP.match(line)]
    if not lines or not FLOW_HEADER.match(lines[0]):
        return None
    labels = {}
    edges = []
    for line in lines[1:]:
        parts = line.split("-->")
        if len(parts) == 1:
            node = _flow_node(parts[0])
            if not node:
                return None
            name, label, explicit = node
            if explicit or name not in labels:
                labels[name] = label
            continue
        if len(parts) != 2:
            return None
        left = _flow_node(parts[0])
        right_text = re.sub(r"^\s*\|[^|]*\|\s*", "", parts[1])
        right = _flow_node(right_text)
        if not left or not right:
            return None
        for name, label, explicit in (left, right):
            if explicit or name not in labels:
                labels[name] = label
        edges.append((left[0], right[0]))
    if len(edges) < 1 or len(edges) != len(labels) - 1:
        return None
    outgoing, incoming = {}, {}
    for start, end in edges:
        if start in outgoing or end in incoming:
            return None
        outgoing[start] = end
        incoming[end] = start
    heads = [name for name in labels if name not in incoming]
    if len(heads) != 1:
        return None
    steps, node = [], heads[0]
    while node is not None:
        steps.append(labels[node])
        node = outgoing.get(node)
        if len(steps) > len(labels):
            return None
    if len(steps) != len(labels):
        return None
    return steps if len(steps) >= 2 else None
# `<!-- figure: id | caption -->`: the id names a scene in the app's library, the caption is the
# sentence under it. The comment form keeps the Markdown clean on GitHub, which hides it.
# `re.M`: the directive is a line in a document, not the whole document.
FIGURE_COMMENT = re.compile(
    r"^\s*<!--\s*figure:\s*([a-z0-9][a-z0-9-]*)\s*(?:\|\s*(.*?))?\s*-->\s*$", re.I | re.M
)
FIGURE_MARK = re.compile(r"^\s*@@figure (\d+)@@\s*$")


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
    # Figures are comments, so they must be lifted out before the blanket comment strip below. A
    # placeholder line survives the strip and becomes the block in the loop with every other line.
    figures = []

    def stash(match):
        figures.append({"t": "figure", "id": match.group(1).lower(), "caption": (match.group(2) or "").strip()})
        return f"\n@@figure {len(figures) - 1}@@\n"

    raw = FIGURE_COMMENT.sub(stash, raw)
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

        figure = FIGURE_MARK.match(line)
        if figure:
            flush_paragraph()
            if not skip_level:
                blocks.append(figures[int(figure.group(1))])
            index += 1
            continue

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
            if language in MERMAID:
                route = flow_route(text)
                if route and not skip_level:
                    blocks.append({"t": "route", "steps": route, "caption": ROUTE_CAPTION})
                continue
            if skip_level:
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
