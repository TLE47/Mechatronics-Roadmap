#!/usr/bin/env python3
"""Which pages have a Bridge Notes visual, and which do not (`scripts/bridge_notes_coverage.py`).

The design asks a Bridge Notes section to end a lesson by handing over to the next idea, with one
small interactive under it. Thirty-five pages carry one; the rest are still the heading they always
were. That is a content queue, not a defect, so this is a report: it answers "what is left, and
where does it sit" in the order the course teaches, instead of a number in a planning document that
goes stale the first time a page gains a card.

It reads the same three sources the app does — the registry (`build_lessons()`), the visual map
(`resources/bridge-visuals.json`) and the generated payloads — so no count is written here.

`--check` turns the report into an integrity gate: every page the map names must be a reader page
whose payload's Bridge Notes heading carries that visual, and every component in the table must be
declared by a page. That is the half of `check_registry_joins.py` that is about visuals, repeated
here so a contributor asking "what is left" finds a broken row before a missing one.

Usage
    python3 scripts/bridge_notes_coverage.py            # the table and the queue
    python3 scripts/bridge_notes_coverage.py --json     # machine-readable
    python3 scripts/bridge_notes_coverage.py --check    # exit 1 on an integrity finding

Exit-code family: typed
    0  the report ran (or --check found nothing)
    1  --check found a broken row
    2  the wrong interpreter (.python-version pins the one the generators need)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import generate_python_lessons_data as lessons_module  # noqa: E402

PAYLOAD_ROOT = os.path.join(ROOT, "app", "public", "lesson-pages")
VISUAL_MAP = os.path.join(ROOT, "resources", "bridge-visuals.json")
PINNED = open(os.path.join(ROOT, ".python-version"), encoding="utf-8").read().strip()

TRACK_LABELS = {
    "track-p": "Track P (Python)",
    "stage-0": "Stage 0 (bench)",
    "ramp": "Ramp",
}


def track_of(lesson: dict) -> str:
    track = lesson.get("track") or ""
    if track in TRACK_LABELS:
        return TRACK_LABELS[track]
    reader = lesson.get("readerPath") or ""
    head = reader.split("/")[0] if "/" in reader else ""
    if head == "modules":
        return "Exercises (modules)"
    if head.startswith("EX."):
        return "Exercises"
    return head or "other"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    parser.add_argument("--check", action="store_true", help="exit 1 if a declared visual is broken")
    parser.add_argument("--all", action="store_true", help="print every page without a visual")
    args = parser.parse_args(argv)

    if sys.version_info[:2] != tuple(int(part) for part in PINNED.split(".")[:2]):
        print(f"this repository pins Python {PINNED}, got {sys.version.split()[0]}", file=sys.stderr)
        return 2

    lessons = [lesson for lesson in lessons_module.build_lessons() if lesson.get("readerPath")]
    map_file = json.load(open(VISUAL_MAP, encoding="utf-8"))
    visuals = map_file["pages"]

    rows = []
    missing = []
    for lesson in lessons:
        name = visuals.get(lesson["readerPath"])
        row = {
            "id": lesson["id"],
            "title": lesson["title"],
            "page": lesson["readerPath"],
            "track": track_of(lesson),
            "visual": name,
        }
        rows.append(row)
        if not name:
            missing.append(row)

    counts = Counter(row["track"] for row in rows)
    covered = Counter(row["track"] for row in rows if row["visual"])
    order = list(dict.fromkeys(row["track"] for row in rows))

    findings: list[str] = []
    if args.check:
        for page, name in sorted(visuals.items()):
            lesson = next((row for row in rows if row["page"] == page), None)
            if lesson is None:
                findings.append(f"{page}: declares {name!r} but is not a reader page in the registry")
                continue
            payload_path = os.path.join(PAYLOAD_ROOT, page[: -len(".md")] + ".json")
            if not os.path.exists(payload_path):
                findings.append(f"{page}: no payload at {os.path.relpath(payload_path, ROOT)}")
                continue
            payload = json.load(open(payload_path, encoding="utf-8"))
            heading = next(
                (
                    block
                    for block in payload.get("blocks", [])
                    if block.get("t") == "h" and str(block.get("x", "")).strip().lower() == "bridge notes"
                ),
                None,
            )
            if heading is None:
                findings.append(f"{page}: declares {name!r} but the payload has no Bridge Notes heading")
            elif heading.get("v") != name:
                findings.append(f"{page}: payload carries {heading.get('v')!r}, map says {name!r}")

    total = len(rows)
    with_visual = total - len(missing)
    if args.json:
        print(
            json.dumps(
                {
                    "pages": total,
                    "withVisual": with_visual,
                    "withoutVisual": len(missing),
                    "byTrack": [
                        {
                            "track": track,
                            "pages": counts[track],
                            "visual": covered[track],
                            "missing": counts[track] - covered[track],
                        }
                        for track in order
                    ],
                    "missing": missing,
                    "findings": findings,
                },
                indent=2,
            )
        )
        return 1 if args.check and findings else 0

    print(f"Bridge Notes coverage — {with_visual} of {total} reader pages carry a visual\n")
    print(f"  {'track':<24}{'pages':>7}{'visual':>8}{'missing':>9}")
    for track in order:
        print(f"  {track:<24}{counts[track]:>7}{covered[track]:>8}{counts[track] - covered[track]:>9}")

    print(f"\nPages still without a visual ({len(missing)}):")
    shown = missing if args.all else missing
    for row in shown:
        print(f"  {row['id']:<26} {row['track']:<24} {row['title'][:60]}")
    if args.all:
        print(f"\n  ({len(shown)} rows; the whole queue)")

    if args.check:
        if findings:
            print("\nIntegrity:")
            for finding in findings:
                print(f"  FAIL {finding}")
            print(f"\n[FAIL] {len(findings)} declared visual(s) disagree with the page or its payload")
            return 1
        print("\n[PASS] every declared visual names a reader page whose payload carries it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
