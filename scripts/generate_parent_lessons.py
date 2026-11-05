#!/usr/bin/env python3
"""Write the parent-lesson manifest the micro runtime reads (`app/src/data/parentLessons.json`).

Micro-learning must not read Markdown or the filesystem at runtime. This build-time adapter turns
the existing Python registry into the small, checked-in metadata table a tab can import. `--check`
keeps it from drifting when a lesson is renamed or moved.

Usage
    python3 scripts/generate_parent_lessons.py
    python3 scripts/generate_parent_lessons.py --check

Exit-code family: typed
    0  written, or already current
    1  stale (with --check)
    2  bad command line
"""

from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import generate_python_lessons_data as registry  # noqa: E402

OUT = os.path.join(ROOT, "app", "src", "data", "parentLessons.json")


def manifest() -> dict:
    lessons = []
    for lesson in registry.build_lessons():
        path = lesson.get("readerPath") or lesson.get("path") or ""
        lessons.append(
            {
                "id": lesson["id"],
                "subjectId": "python",
                "title": lesson["title"],
                "path": path,
                "sourceFormat": "markdown",
            }
        )
    return {"version": 1, "lessons": lessons}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail when the manifest is stale")
    args = parser.parse_args(argv)
    payload = json.dumps(manifest(), indent=2, ensure_ascii=False) + "\n"
    try:
        with open(OUT, encoding="utf-8") as handle:
            current = handle.read()
    except OSError:
        current = ""
    if args.check:
        if current != payload:
            print(f"[FAIL] {os.path.relpath(OUT, ROOT)} is stale; run scripts/generate_parent_lessons.py", file=sys.stderr)
            return 1
        print(f"ok parent lessons: {len(manifest()['lessons'])} entries")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(payload)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(manifest()['lessons'])} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
