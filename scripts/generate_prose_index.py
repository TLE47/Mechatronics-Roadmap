#!/usr/bin/env python3
"""Write the searchable text of the course pages the workbench does not carry.

The palette's `⌘⇧F` reads the runner's lessons — the starter, the hint ladder, the checks and the
expected output. The reading pages are somewhere else: 48 prose lessons plus the 17 arm modules,
Markdown in this repository, rendered by GitHub and therefore **not** part of the app bundle. So a
learner who remembers "the page about anti-windup" could find the lesson by its name and could not
find the page by a word in its body.

This generator copies what is searchable out of those 65 pages into `app/public/prose-index.json`,
which the browser fetches **the first time** `⌘⇧F` is used, never on a normal visit. The copy is
deliberately not a copy of the page:

- **Code is not indexed.** Fenced blocks, inline code markers and `$$` maths go; the runner already
  carries the code a lesson runs, and a search hit there is a line you can stand on.
- **Tables are not indexed.** A row of pipes reads as punctuation in a snippet.
- **The generated callouts are not indexed.** The "Run this in the workbench" block, the "Try this"
  link and the "Next:" line are written by scripts into every page; indexing them would make every
  page match the next page's title. The ladder-gate exam is left out for a second reason: it is one
  paper rendered on every page of a ladder, so indexing it would answer one search with ten copies.
- **Everything else is**, headings first: the prose, the lists, the safety blockquotes, and the
  recurrence/recap sections, one entry per heading so a hit can name its section and open the page
  at it.

The page list is `scripts/route_model.py`'s, not a glob of this file's own: the 48 lessons and the
17 arm modules the route declares are exactly the 65 pages a learner is sent to. `--check` fails
when the committed JSON differs from what those pages say now, so a page cannot be edited — or
added — without the search knowing.

Usage:
    python3 scripts/generate_prose_index.py             # write app/public/prose-index.json
    python3 scripts/generate_prose_index.py --check     # exit 1 if it is stale
    python3 scripts/generate_prose_index.py --stats     # sizes and counts, write nothing
"""

import argparse
import gzip
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "public", "prose-index.json")

sys.path.insert(0, os.path.join(ROOT, "scripts"))
import route_model  # noqa: E402

# A marker pair wraps text a script writes into every page. Removed with its content, before the
# generic comment strip, because the content is what makes the page long and unhelpful to match.
GENERATED_BLOCKS = [
    re.compile(r"<!--\s*run-callout:start\s*-->.*?<!--\s*run-callout:end\s*-->", re.S),
    re.compile(r"<!--\s*next-step:start\s*-->.*?<!--\s*next-step:end\s*-->", re.S),
    re.compile(r"<!--\s*try-link:start\s*-->.*?<!--\s*try-link:end\s*-->", re.S),
    # The ladder gate is one exam paper written onto every page of a ladder ("every Tier 2 page
    # renders this same paper"). Indexed, one search would return the same hit ten times under ten
    # page ids; the paper is one page's text, and its concepts are in the syllabus.
    re.compile(r"<!--\s*ladder-gate:start\s*-->.*?<!--\s*ladder-gate:end\s*-->", re.S),
]
COMMENT = re.compile(r"<!--.*?-->", re.S)
IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
TAG = re.compile(r"<[^>]+>")
LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?")
HEADING = re.compile(r"^(#{1,4})\s+(.*?)\s*#*\s*$")
RULE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")

# What a snippet should not be full of: emphasis markers and inline-code fences. Underscores stay,
# because `K_p` and `mechalab_plant` are names a learner may type.
INLINE_NOISE = re.compile(r"[*`]+")


def page_rows():
    """The 65 pages a learner is sent to, in route order, as `{id, title, path}`."""
    rows = []
    seen = set()
    for step in route_model.STEPS:
        for lesson in route_model.step_lessons(step):
            if lesson["path"] in seen:
                continue
            seen.add(lesson["path"])
            rows.append({"id": lesson["id"], "title": lesson["title"], "path": lesson["path"]})
        for module in route_model.step_modules(step):
            # The arm layer is every Tier 1 bridge plus the capstone; the depth modules are the
            # optional second pass and are not what the gap page's "65 prose pages" counts.
            if route_model.module_layer(module["id"]) != "arm":
                continue
            path = "modules/%s.md" % module["id"]
            if path in seen:
                continue
            seen.add(path)
            rows.append({"id": module["id"], "title": module["title"], "path": path})
    return rows


def clean(text):
    """One line of Markdown as the words a learner would search for."""
    text = IMAGE.sub("", text)
    text = LINK.sub(r"\1", text)
    text = TAG.sub("", text)
    text = INLINE_NOISE.sub("", text)
    text = text.strip()
    if text.startswith(">"):
        text = text.lstrip(">").strip()
    text = LIST_MARKER.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def sections_of(raw, fallback_title):
    """The page as `[{h, t}]`: one entry per heading, its body one line per paragraph.

    The page's own `# Title` is the entry's title, not a section: a section whose heading is the
    title would make every hit look like it matched the name of the page.
    """
    for pattern in GENERATED_BLOCKS:
        raw = pattern.sub("", raw)
    raw = COMMENT.sub("", raw)
    body = raw
    # The frontmatter's closing fence is the first `---` line after the opening one.
    if raw.startswith("---"):
        end = raw.find("\n---", 4)
        if end >= 0:
            body = raw[end + 4 :]

    sections = []
    heading = ""
    lines = []
    in_fence = False
    fence = ""
    in_math = False

    def flush():
        text = "\n".join(line for line in lines if line)
        if text:
            sections.append({"h": heading, "t": text})

    for raw_line in body.split("\n"):
        line = raw_line.rstrip()
        stripped = line.strip()
        if in_fence:
            if stripped.startswith(fence):
                in_fence = False
            continue
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = True
            fence = stripped[:3]
            continue
        if stripped.startswith("$$"):
            # A display-maths block: `$$` on its own line opens and closes it. One-line `$$x$$`
            # pairs are left in as text, because the sentence around them is prose.
            if in_math or not (len(stripped) > 4 and stripped.endswith("$$")):
                in_math = not in_math
            continue
        if in_math:
            continue
        if RULE.match(line) or stripped.startswith("|"):
            continue
        match = HEADING.match(line)
        if match:
            level, text = len(match.group(1)), match.group(2)
            if level == 1:
                continue
            flush()
            heading = clean(text) or fallback_title
            lines = []
            continue
        cleaned = clean(line)
        if cleaned:
            lines.append(cleaned)
    flush()
    return sections


def title_of(raw, fallback):
    """The frontmatter title when there is one, so the row reads like the lesson's own card."""
    if raw.startswith("---"):
        end = raw.find("\n---", 4)
        if end >= 0:
            for line in raw[4:end].split("\n"):
                key, sep, value = line.partition(":")
                if sep and key.strip() == "title":
                    return value.strip().strip('"').strip("'") or fallback
    for line in raw.split("\n"):
        match = HEADING.match(line)
        if match and len(match.group(1)) == 1:
            return clean(match.group(2)) or fallback
    return fallback


def payload():
    pages = []
    for row in page_rows():
        path = os.path.join(ROOT, row["path"])
        with open(path, encoding="utf-8") as handle:
            raw = handle.read()
        title = title_of(raw, row["title"] or row["id"])
        pages.append(
            {
                "id": row["id"],
                "path": row["path"],
                "title": title,
                "sections": sections_of(raw, title),
            }
        )
    return {"v": 1, "pages": pages}


def render(data):
    """Minified and newline-terminated: the browser parses it, a diff reads one page per line."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


def measure(text):
    raw = text.encode("utf-8")
    return len(raw), len(gzip.compress(raw, 9))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit 1 when the committed file is stale")
    parser.add_argument("--stats", action="store_true", help="print counts and sizes, write nothing")
    args = parser.parse_args()

    data = payload()
    text = render(data)
    raw, packed = measure(text)

    if args.stats:
        sections = sum(len(page["sections"]) for page in data["pages"])
        print(f"{len(data['pages'])} pages, {sections} sections, {raw / 1024:.1f} kB raw, "
              f"{packed / 1024:.1f} kB gzipped")
        return

    if args.check:
        committed = ""
        if os.path.exists(OUT):
            with open(OUT, encoding="utf-8") as handle:
                committed = handle.read()
        if committed == text:
            print(f"prose index is current: {len(data['pages'])} pages, {packed / 1024:.1f} kB gzipped")
            return
        old = {}
        if committed:
            try:
                old = {page["path"]: page for page in json.loads(committed).get("pages", [])}
            except json.JSONDecodeError:
                old = {}
        new = {page["path"]: page for page in data["pages"]}
        changed = sorted(path for path in new if old.get(path) != new[path])
        gone = sorted(path for path in old if path not in new)
        print(
            f"prose index is stale: {len(changed)} page(s) differ, {len(gone)} removed "
            f"({', '.join(changed[:4]) or 'no text change'}). Run scripts/generate_prose_index.py.",
            file=sys.stderr,
        )
        sys.exit(1)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(data['pages'])} pages, "
          f"{raw / 1024:.1f} kB raw, {packed / 1024:.1f} kB gzipped")


if __name__ == "__main__":
    main()
