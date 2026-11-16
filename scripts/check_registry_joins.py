#!/usr/bin/env python3
"""One gate for the joins a lesson spans (`scripts/check_registry_joins.py`).

Making a page runnable touches five registries at once: the lesson list the app imports
(`pythonLessonsData.ts`), the generated reader payloads, the Bridge Notes visual map, the
run-this-in-the-workbench callout on each page, and the Stage 0 step map in `practiceLinks.ts`.
Each of those already has a generator and a `--check`; what none of them has is a statement that
the five agree, so a lesson that becomes runnable can be half-wired and every individual gate stays
green. That is exactly how three CI jobs went red in one push: two pages had no figure, the counts
in `test_run_callout.py` were stale, and the Level 0 join had been right only by luck.

The truth this gate reads is the least derived one: `build_lessons()` from the generator, the
payloads on disk, `resources/bridge-visuals.json` and the page files' own front matter. It then says
what it found, one line per join, so a failure names the page and the file that disagrees.

Two things are deliberately *not* required here, because the repository does not claim them:

- a page's registry *title* is the lesson's title, not the module page's heading. An exercise entry
  (`EX.…`) reads a module page whose title is the topic; only a page that is also the lesson's own
  source (`readerPath == path`) must match the registry title.
- a Bridge Notes heading on every page. It is required on the pages the visual map names, and only
  there; a page without a visual is the heading it always was.

Usage
    python3 scripts/check_registry_joins.py            # every join
    python3 scripts/check_registry_joins.py --verbose  # + the counts behind each pass

Exit-code family: typed
    0  every join holds
    1  a finding, each named
    2  the wrong interpreter (.python-version pins the one the generators need)
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import generate_python_lessons_data as lessons_module  # noqa: E402
import generate_run_callouts as callouts_module  # noqa: E402

PAYLOAD_ROOT = os.path.join(ROOT, "app", "public", "lesson-pages")
VISUAL_MAP = os.path.join(ROOT, "resources", "bridge-visuals.json")
VISUAL_TABLE = os.path.join(ROOT, "app", "src", "bridges", "bridgeNotesVisual.tsx")
PRACTICE = os.path.join(ROOT, "app", "src", "practiceLinks.ts")
PINNED = open(os.path.join(ROOT, ".python-version"), encoding="utf-8").read().strip()


def rel(path: str) -> str:
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def payload_path(reader_path: str) -> str:
    assert reader_path.endswith(".md"), reader_path
    return os.path.join(PAYLOAD_ROOT, reader_path[: -len(".md")] + ".json")


def visual_names_in_table() -> set[str]:
    text = open(VISUAL_TABLE, encoding="utf-8").read()
    return set(re.findall(r"'([a-z0-9-]+)':\s*[A-Z]\w*,", text))


def level_zero_pages() -> dict[str, str]:
    """The Stage 0 step map, read from the module the app ships (not a copy of it)."""
    text = open(PRACTICE, encoding="utf-8").read()
    block = re.search(r"const LEVEL_0_PAGE[^{]*\{(.*?)\}", text, re.S)
    if not block:
        raise SystemExit("practiceLinks.ts no longer declares LEVEL_0_PAGE; this gate cannot read the join")
    return dict(re.findall(r"(\w+):\s*'([^']+)'", block.group(1)))


def bridge_heading(payload: dict) -> dict | None:
    for block in payload.get("blocks", []):
        if block.get("t") == "h" and str(block.get("x", "")).strip().lower() == "bridge notes":
            return block
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--verbose", action="store_true", help="print the counts behind each pass")
    args = parser.parse_args(argv)

    if sys.version_info[:2] != tuple(int(part) for part in PINNED.split(".")[:2]):
        print(
            f"this repository pins Python {PINNED} (.python-version), got {sys.version.split()[0]}",
            file=sys.stderr,
        )
        return 2

    findings: list[str] = []
    lessons = lessons_module.build_lessons()
    with_reader = [lesson for lesson in lessons if lesson["readerPath"]]
    by_reader_path = {lesson["readerPath"]: lesson for lesson in with_reader}
    registry_ids = {lesson["id"] for lesson in lessons}

    # 1. Every lesson with a reader page has the payload the reader fetches, and it is its own page.
    expected_payloads: dict[str, str] = {}
    for lesson in with_reader:
        path = payload_path(lesson["readerPath"])
        expected_payloads[rel(path)] = lesson["id"]
        if not os.path.exists(path):
            findings.append(f"{lesson['id']}: no payload at {rel(path)}")
            continue
        payload = json.load(open(path, encoding="utf-8"))
        if payload.get("path") != lesson["readerPath"]:
            findings.append(
                f"{lesson['id']}: {rel(path)} renders {payload.get('path')!r}, registry says {lesson['readerPath']!r}"
            )
        if lesson["readerPath"] == lesson["path"] and payload.get("title") != lesson["title"]:
            findings.append(
                f"{lesson['id']}: {rel(path)} is titled {payload.get('title')!r}, registry says {lesson['title']!r}"
            )
    if args.verbose:
        print(f"  payloads: {len(expected_payloads)} of {len(with_reader)} reader pages")

    # 2. No payload belongs to no lesson: an orphan is a page the app can never open.
    on_disk = {rel(path) for path in glob.glob(os.path.join(PAYLOAD_ROOT, "**", "*.json"), recursive=True)}
    for orphan in sorted(on_disk - set(expected_payloads)):
        findings.append(f"{orphan}: a generated payload no registry entry reads")
    for missing in sorted(set(expected_payloads) - on_disk):
        findings.append(f"{missing}: expected for {expected_payloads[missing]} but not on disk")

    # 3. Every visual is where its map says, and the map names a component the table ships.
    visuals = json.load(open(VISUAL_MAP, encoding="utf-8"))["pages"]
    table = visual_names_in_table()
    for page, name in sorted(visuals.items()):
        lesson = by_reader_path.get(page)
        if lesson is None:
            findings.append(f"{page}: carries visual {name!r} but is not a reader page in the registry")
            continue
        if name not in table:
            findings.append(f"{page}: visual {name!r} is not in bridgeNotesVisual.tsx's table")
        path = payload_path(page)
        if not os.path.exists(path):
            continue  # already named by check 1
        payload = json.load(open(path, encoding="utf-8"))
        heading = bridge_heading(payload)
        if heading is None:
            findings.append(f"{page}: map declares {name!r} but the payload has no Bridge Notes heading")
        elif heading.get("v") != name:
            findings.append(
                f"{page}: payload's Bridge Notes heading carries {heading.get('v')!r}, the map says {name!r}"
            )
    for name in sorted(table - set(visuals.values())):
        findings.append(f"bridgeNotesVisual.tsx ships {name!r} but no page declares it")
    if args.verbose:
        print(f"  visuals: {len(visuals)} pages, {len(table)} components")

    # 4. The callout reaches every reader page plus the bench pages that have no entry — and nothing
    #    else. Those two sets together are the app's whole page surface; an extra page here is a page
    #    a reader can find that no registry and no callout knows about.
    covered = callouts_module.all_pages()
    no_entry = callouts_module.no_entry_pages()
    covered_pages = {path for _id, path in covered}
    no_entry_pages = {path for _id, path in no_entry}
    expected_pages = set(by_reader_path) | no_entry_pages
    for extra in sorted(covered_pages - expected_pages):
        findings.append(f"{extra}: gets a run callout but is neither a registry page nor a bench page")
    for missing in sorted(expected_pages - covered_pages):
        findings.append(f"{missing}: a page with no run callout")
    if no_entry_pages & set(by_reader_path):
        for both in sorted(no_entry_pages & set(by_reader_path)):
            findings.append(f"{both}: says it has no workbench entry, but the registry lists it")
    covered_ids = {lesson_id for lesson_id, _path in covered if lesson_id}
    no_entry_ids = {lesson_id for lesson_id, _path in no_entry if lesson_id}
    for extra in sorted(covered_ids - registry_ids - no_entry_ids):
        findings.append(f"callout names id {extra!r}, which is neither a registry entry nor a bench page")
    if args.verbose:
        print(
            f"  callouts: {len(covered_pages)} pages, {len(no_entry_pages)} with no workbench entry"
        )

    # 5. Every Stage 0 step that names a page names one the registry actually has.
    for step, page_id in sorted(level_zero_pages().items()):
        if page_id not in registry_ids:
            findings.append(f"{step}: LEVEL_0_PAGE names {page_id!r}, which the registry does not have")
        elif not page_id.startswith("S0."):
            findings.append(f"{step}: LEVEL_0_PAGE names {page_id!r}, which is not a Stage 0 page")
    if args.verbose:
        print(f"  level 0: {len(level_zero_pages())} step(s) map to a page")

    if findings:
        for finding in findings:
            print(f"  FAIL {finding}")
        print(f"\n[FAIL] {len(findings)} registry join(s) disagree; the registry is the source, fix the file named.")
        return 1
    print(
        f"  ok {len(with_reader)} reader pages, {len(visuals)} visuals, {len(covered_pages)} callouts, "
        f"{len(level_zero_pages())} Stage 0 joins"
    )
    print("\n[PASS] Registry joins: every reader payload, visual, callout and Stage 0 step names a page that exists.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
