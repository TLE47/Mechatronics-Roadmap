#!/usr/bin/env python3
"""Render the README's Start here block from `app/src/data/startHere.json`.

The front page and the workbench landing screen have to open with the same three lines, and they
used to be typed twice - once in README.md, once in `app/src/startHere.ts` - with a checker that
compared the copies. A checker only finds a drift after someone has already published it.

Now the JSON is the only copy of the words. This script writes the README block, the app imports
the same file, and the lesson path is resolved from the lesson pages by id, so neither side can
name a page the other does not. `--check` is what CI runs; it is also folded into
`scripts/check_consistency.py`, which already owns README checks.

Markers:

    <!-- start-here:start -->
    ...
    <!-- start-here:end -->

Usage:
    python3 scripts/generate_start_here.py            # rewrite the README block
    python3 scripts/generate_start_here.py --check    # exit 1 if the block is stale
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import route_model  # noqa: E402

README = os.path.join(ROOT, "README.md")
DATA = os.path.join(ROOT, "app", "src", "data", "startHere.json")
START = "<!-- start-here:start -->"
END = "<!-- start-here:end -->"
REQUIRED = ("heading", "definition", "linkLabel", "note", "lessonId")


def data():
    """The shared block, refusing a file that lost one of its four fields."""
    with open(DATA, encoding="utf-8") as handle:
        payload = json.load(handle)
    missing = [key for key in REQUIRED if not str(payload.get(key, "")).strip()]
    if missing:
        raise ValueError(
            f"app/src/data/startHere.json is missing {', '.join(missing)}; the README block and "
            f"the landing screen both read this file"
        )
    return payload


def lesson_path(lesson_id):
    """The page for a lesson id, read from the lesson files rather than typed here."""
    for step in route_model.STEPS:
        for row in route_model.step_lessons(step):
            if row["id"] == lesson_id:
                return row["path"]
    raise ValueError(
        f"app/src/data/startHere.json names lesson {lesson_id!r}, which no route page defines"
    )


def render_block():
    payload = data()
    path = lesson_path(payload["lessonId"])
    return "\n".join(
        [
            f"> **{payload['heading']}**",
            ">",
            f"> {payload['definition']}",
            ">",
            f"> **[{payload['linkLabel']}]({path})**",
            ">",
            f"> {payload['note']}",
        ]
    )


def rewrite(text):
    """Replace the block between the markers, or say why that is impossible."""
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    if not pattern.search(text):
        raise ValueError(
            f"README.md has no {START} ... {END} block, so the Start here lines cannot be "
            f"generated; restore the markers around them"
        )
    return pattern.sub(lambda _m: f"{START}\n{render_block()}\n{END}", text)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if README.md is stale")
    args = parser.parse_args(argv)

    with open(README, encoding="utf-8") as handle:
        current = handle.read()
    try:
        expected = rewrite(current)
    except ValueError as error:
        print(error)
        return 1

    if args.check:
        if current != expected:
            print("README.md Start here block is stale; run scripts/generate_start_here.py")
            return 1
        print("README.md Start here block is current")
        return 0

    with open(README, "w", encoding="utf-8") as handle:
        handle.write(expected)
    print("wrote the Start here block in README.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
