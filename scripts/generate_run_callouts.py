#!/usr/bin/env python3
"""Put the standard "run this in the workbench" callout on every page the workbench lists.

A search result lands on a Markdown page, not on the app, so the page itself has to say where the
code runs. The line names the entry's workbench id - the same string the workbench list and its
search box use - and it is generated from `app/src/data/pythonLessonsData.ts`, the registry the
workbench renders. A page cannot carry a stale or invented id, and a page that gains an entry
gains the callout by re-running this script instead of by someone remembering to retype it.

The block sits directly under the H1 (module pages have no H1, so it opens the body) and is
wrapped in `run-callout` markers, so re-running is idempotent: the old block is removed and
re-inserted rather than stacked.

Usage:
    python3 scripts/generate_run_callouts.py            # write every page
    python3 scripts/generate_run_callouts.py --check    # exit 1 if any page is stale
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "src", "data", "pythonLessonsData.ts")
WORKBENCH = "https://tle47.github.io/Mechatronics-Roadmap/"

START = "<!-- run-callout:start -->"
END = "<!-- run-callout:end -->"


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def workbench_pages():
    """(workbench id, page path relative to the repo root) for every entry that is a page.

    Parsed from the generated registry rather than from the sources, so the callout can only ever
    name an id the app actually shows. Exercise entries point at `solution.py`; their module page
    is the one a reader lands on, and `exercise.json` already records it.
    """
    text = read(DATA)
    _, sep, payload = text.partition("PYTHON_LESSONS: PythonLessonItem[] =")
    if not sep:
        raise SystemExit("ERROR: %s has no PYTHON_LESSONS array" % DATA)
    entries = json.loads(payload.rstrip().rstrip(";"))
    pages = []
    for entry in entries:
        path = entry["path"]
        if path.endswith(".md"):
            pages.append((entry["id"], path))
            continue
        if not path.startswith("exercises/"):
            continue
        manifest = os.path.join(ROOT, os.path.dirname(path), "exercise.json")
        module = json.loads(read(manifest)).get("module")
        if module:
            pages.append((entry["id"], module))
    seen = {}
    for lesson_id, path in pages:
        if path in seen and seen[path] != lesson_id:
            raise SystemExit("ERROR: %s is claimed by both %s and %s" % (path, seen[path], lesson_id))
        seen[path] = lesson_id
    return pages


def block(lesson_id):
    """The one callout, rendered from the id alone."""
    return (
        "%s\n"
        "> **Run this in the workbench.** [Open MechaLab](%s) → **Tab 2, Run Python Lessons** "
        "→ search `%s` and pick it from the list. The starter code, hints and graded check live "
        "there; this page is the reading copy, and nothing you type here is saved.\n"
        "%s\n" % (START, WORKBENCH, lesson_id, END)
    )


def strip_block(text):
    """Remove an already-generated block and the blank line it owns."""
    return re.sub(
        re.escape(START) + r".*?" + re.escape(END) + r"\n",
        "",
        text,
        flags=re.DOTALL,
    )


def split_front_matter(text):
    """(front matter including its closing `---\\n`, body)."""
    if not text.startswith("---\n"):
        return "", text
    close = text.find("\n---\n", 4)
    if close == -1:
        return "", text
    end = close + len("\n---\n")
    return text[:end], text[end:]


def with_callout(text, lesson_id):
    text = strip_block(text).rstrip("\n") + "\n"
    front, body = split_front_matter(text)
    lines = body.split("\n")
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].startswith("# "):
        # The H1 stays first; the block follows it, then whatever the page had next.
        head = lines[i]
        tail = "\n".join(lines[i + 1 :]).lstrip("\n")
        new_body = head + "\n\n" + block(lesson_id) + (("\n" + tail) if tail else "")
    else:
        new_body = block(lesson_id) + "\n" + body.lstrip("\n")
    return front + ("\n" if front else "") + new_body


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="report stale pages instead of writing")
    args = parser.parse_args(argv)

    pages = workbench_pages()
    stale = []
    for lesson_id, rel in pages:
        path = os.path.join(ROOT, rel)
        before = read(path)
        after = with_callout(before, lesson_id)
        if before == after:
            continue
        stale.append((lesson_id, rel))
        if not args.check:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(after)

    if args.check:
        if stale:
            print("ERROR: %d page(s) do not carry the current workbench callout:" % len(stale))
            for lesson_id, rel in stale:
                print("  %s  (%s)" % (rel, lesson_id))
            print("Run `python3 scripts/generate_run_callouts.py`.")
            return 1
        print("OK: all %d workbench pages carry their generated run callout." % len(pages))
        return 0

    print("Updated %d of %d workbench pages." % (len(stale), len(pages)))
    for lesson_id, rel in stale:
        print("  %s  (%s)" % (rel, lesson_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())
