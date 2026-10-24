#!/usr/bin/env python3
"""Render `docs/pilot-results.md` from the participant folders (`scripts/pilot_results.py`).

The results page is where the pilot's claims become public, and it is the one page a reader has no way
to check: the folders behind it are git-ignored, so a typed `N = 3` would look exactly like a measured
one. So the page is generated. `--check` is the gate, and the count it prints is read from the same
predicate `scripts/pilot_sitting.py --status` uses — an export in the folder **and** a closed sitting
record — so the page cannot claim a participant that does not exist, and cannot fall behind one that
does.

What the records can support, and what they cannot:

| Section | Source |
| :--- | :--- |
| Participants, per stage | `pilot-data/*/sitting.json`, counted only with an export behind it |
| Funnel, time per stage | the same records' `active_minutes`, `elapsed_minutes` and `finished` |
| Help per lesson | a sitting that covered exactly one lesson, so one help type belongs to one page |
| Top 10 stuck points | the record's `stops`, grouped by page and kind |
| Delayed transfer | `follow-up.json` in the same folder, written by `scripts/pilot_followup.py` |
| Before/after on revised pages | **not derivable** — a revision is a diff against the page, kept in git |

The author walk is not generated: it is a narrative in [`docs/AUTHOR_WALK.md`](../docs/AUTHOR_WALK.md),
inlined here so one page still reads end to end, and `--check` fails if the two disagree.

Usage
    python3 scripts/pilot_results.py                 # write docs/pilot-results.md from pilot-data/
    python3 scripts/pilot_results.py --out /tmp/results.md
    python3 scripts/pilot_results.py --check         # exit 1 if the committed page is stale

Exit-code family: typed
    0  the page was written, or is already current
    1  the page is stale, or a record could not be read
    2  the command line, or the output path, could not be used
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
from statistics import median

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import pilot_followup  # noqa: E402  - the transfer record, so its verdicts are read, never retyped
import pilot_sitting  # noqa: E402  - the record and the one `counted()` predicate

ROOT = os.path.dirname(SCRIPT_DIR)
OUT = os.path.join(ROOT, "docs", "pilot-results.md")
WALK = os.path.join(ROOT, "docs", "AUTHOR_WALK.md")
DATA = pilot_sitting.DATA
TOP_STUCK = 10

# `docs/PILOT.md` §1. The order is the protocol's: each stage is recruited from the one before it.
STAGES = (
    ("smoke", "Smoke (Track P + Stage 0)"),
    ("p1", "P1 (Tier 1)"),
    ("p2", "P2 (Tier 2 Core)"),
    ("p3", "P3 (Tier 3 Core)"),
)


def participants() -> tuple[list[dict], int]:
    """`(counted participants, records the page refuses to count)`.

    A participant is one folder that holds an export **and** a record with every question answered,
    which is `pilot_sitting.counted()` — the same predicate `--status` prints its number from — **and**
    a record `pilot_sitting.audit()` passes, so a page that is published cannot quote a claim its own
    evidence refuses. Two counts of one pilot that disagree is how a results page ends up quoting a
    participant nobody measured.
    """
    people: list[dict] = []
    not_counted = 0
    for folder in sorted(glob.glob(os.path.join(DATA, "*"))):
        if not os.path.isdir(folder):
            continue
        try:
            record = pilot_sitting.read_record(folder)
        except (OSError, ValueError):
            # A record that cannot be read is not a participant; `--check` on the record names the error.
            not_counted += 1
            continue
        if record is None:
            continue
        fails, _, _ = pilot_sitting.audit(folder, record)
        if fails or not pilot_sitting.counted(record, folder):
            not_counted += 1
            continue
        found = pilot_sitting.evidence(record, folder)
        sheet = found.get("sheet") or {}
        try:
            follow_up = pilot_followup.read_record(folder)
        except (OSError, ValueError):
            follow_up = None
        people.append(
            {
                "folder": folder,
                "record": record,
                "stage": record.get("stage"),
                "lessons": list(sheet.get("lessons") or []),
                "help": record.get("help"),
                "active": record.get("active_minutes"),
                "elapsed": record.get("elapsed_minutes"),
                "overhead": record.get("overhead_minutes"),
                "finished": record.get("finished") is True,
                "ended_early": record.get("finished") is False,
                "transfer": ((follow_up or {}).get("result") or {}).get("verdict"),
                "asked": follow_up is not None,
                "stops": list(record.get("stops") or []),
            }
        )
    return people, not_counted


def number(value, suffix: str = "") -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        value = round(value, 1)
        return f"{value:g}{suffix}"
    return f"{value}{suffix}"


def span(values: list) -> str:
    """`median (low–high)`, the shape `PILOT.md` §5 asks for: a median and a range, never a mean."""
    clean = [value for value in values if isinstance(value, int) and not isinstance(value, bool)]
    if not clean:
        return "—"
    middle = number(float(median(clean)))
    return f"{middle} ({min(clean)}–{max(clean)})"


def walk() -> str:
    """The author walk, from its own file, with its own H1 dropped so it slots into this page."""
    try:
        with open(WALK, encoding="utf-8") as handle:
            lines = handle.read().splitlines()
    except OSError:
        return "_The author walk is missing from `docs/AUTHOR_WALK.md`._"
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
    while lines and not lines[0].strip():
        lines.pop(0)
    return "\n".join(lines).rstrip()


def stuck_rows(people: list[dict]) -> list[tuple[str, str, int]]:
    """Stops grouped by `(page, kind)`, most frequent first, with ties broken by page then kind."""
    grouped: dict[tuple[str, str], int] = {}
    for person in people:
        for stop in person["stops"]:
            page = str(stop.get("page") or "").strip()
            kind = str(stop.get("kind") or "").strip()
            if not page or not kind:
                continue
            grouped[(page, kind)] = grouped.get((page, kind), 0) + 1
    ordered = sorted(grouped.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
    return [(page, kind, count) for (page, kind), count in ordered[:TOP_STUCK]]


def render(people: list[dict], not_counted: int) -> str:
    total = len(people)
    lines = [
        "# Pilot results — **template, no participants yet**"
        if total == 0
        else f"# Pilot results — **{total} non-author participant{'s' if total != 1 else ''}**",
        "",
        "<!-- Generated by scripts/pilot_results.py - do not edit by hand.",
        "     Re-run: python3 scripts/pilot_results.py -->",
        "",
    ]
    if total == 0:
        lines += [
            "> **This page contains no results.** No pilot has run: N = 0 at every stage, and every table",
            "> below is empty on purpose. The protocol that fills it is [`docs/PILOT.md`](PILOT.md). Until a",
            "> real sitting happens, every hour figure in the course is an author target, and no claim of",
            "> beginner completion is made anywhere in this repository.",
        ]
    else:
        lines += [
            f"> **{total} non-author participant{'s' if total != 1 else ''}**, published as aggregates: no names,",
            "> no screenshots, no quote without consent, and a count beside every percentage, because five",
            "> people are described rather than turned into statistics. A pilot that missed its targets is",
            "> published as it happened; the protocol is [`docs/PILOT.md`](PILOT.md).",
        ]
    lines += [
        "",
        "```mermaid",
        "flowchart LR",
        f'    Now["Now: N = {total} at every stage"] --> Smoke["Smoke"]',
        "    Smoke --> P1[\"P1\"]",
        "    P1 --> P2[\"P2\"]",
        "    P2 --> P3[\"P3\"]",
        '    P3 --> Done["Results replaced with<br/>counts, medians and limits"]',
        "```",
        "",
        "## Status",
        "",
        f"**Participants (non-author): {total}.** Counted here so `docs/SIM_ROUTE.md` can refuse a",
        "`pilot-validated` status without them; a participant is non-author when they are not the person who",
        "wrote the page. The count is not typed into this page from memory:",
        "[`scripts/pilot_sitting.py --status`](../scripts/pilot_sitting.py) reads it from the participant",
        "folders, and a folder counts only when it holds an export **and** a closed sitting record behind it.",
    ]
    if total == 0:
        lines += [
            "With none it prints `N (non-author) = 0` and says this page stays the template it is.",
        ]
    if not_counted:
        lines += [
            "",
            f"**{not_counted} record{'s' if not_counted != 1 else ''} not counted** — a folder with a record and no",
            "export, with a question the observer has not answered, or with a claim its evidence does not",
            "support. `--status` and `--check` name which, and this page does not quote them.",
        ]
    lines += [
        "",
        "| Stage | Started | Finished | Notes |",
        "| :--- | ---: | ---: | :--- |",
    ]
    for key, label in STAGES:
        group = [person for person in people if person["stage"] == key]
        finished = [person for person in group if person["finished"]]
        if not group:
            notes = "—"
        else:
            notes = f"median {span([person['active'] for person in group])} active min"
            ended = sum(1 for person in group if person["ended_early"])
            if ended:
                notes += f"; {ended} ended early (a finding, published as one)"
        lines.append(f"| {label} | {len(group)} | {len(finished)} | {notes} |")
    lines += [
        "",
        "## Author walk — one graded exercise, not a participant",
        "",
        walk(),
        "",
        "## Funnel",
        "",
    ]
    if total == 0:
        lines.append("_Empty._ Record how many started each stage and how many finished, with the stage they left at.")
    else:
        lines += [
            "How many started each stage, how many finished it, and how many ended early — an early end is",
            "the finding round 1 exists to collect, not a failure of the participant.",
            "",
            "| Stage | Started | Finished | Ended early | Notes |",
            "| :--- | ---: | ---: | ---: | :--- |",
        ]
        for key, label in STAGES:
            group = [person for person in people if person["stage"] == key]
            done = sum(1 for person in group if person["finished"])
            ended = sum(1 for person in group if person["ended_early"])
            notes = "—" if group else "no sitting yet"
            lines.append(f"| {label} | {len(group)} | {done} | {ended} | {notes} |")

    lines += ["", "## Time per stage", ""]
    if total == 0:
        lines.append("_Empty._ Median and range of `active_minutes`, per stage. No means, no percentages without counts.")
    else:
        lines += [
            "Medians and ranges, not means: with a handful of participants a mean is a number nobody had.",
            "",
            "| Stage | Participants | Active minutes | Elapsed minutes | Overhead minutes |",
            "| :--- | ---: | :--- | :--- | :--- |",
        ]
        for key, label in STAGES:
            group = [person for person in people if person["stage"] == key]
            if not group:
                lines.append(f"| {label} | 0 | — | — | — |")
                continue
            lines.append(
                f"| {label} | {len(group)} | {span([p['active'] for p in group])} | "
                f"{span([p['elapsed'] for p in group])} | {span([p['overhead'] for p in group])} |"
            )

    lines += ["", "## Help per lesson", ""]
    single = [person for person in people if len(person["lessons"]) == 1]
    if not single:
        lines.append(
            "_Empty._ Count of `help` values per lesson id, against the budget in [`docs/PILOT.md`](PILOT.md) §3"
        )
        lines.append("(fewer than 1 in 3 lessons needing help; no lesson needing help from more than half the participants).")
        if total:
            lines += [
                "",
                "A sitting that covered more than one lesson is left out of this table: one help event cannot be",
                "apportioned to one of several pages without inventing the split.",
            ]
    else:
        lessons = sorted({person["lessons"][0] for person in single})
        helps = ["none", "hint_1", "hint_2", "solution", "person"]
        lines += [
            "| Lesson | Participants | " + " | ".join(helps) + " |",
            "| :--- | ---: | " + " | ".join("---:" for _ in helps) + " |",
        ]
        for lesson in lessons:
            group = [person for person in single if person["lessons"][0] == lesson]
            counts = [sum(1 for person in group if person["help"] == kind) for kind in helps]
            lines.append(
                f"| `{lesson}` | {len(group)} | " + " | ".join(str(count) for count in counts) + " |"
            )
        if len(single) != total:
            lines += [
                "",
                f"{total - len(single)} sitting(s) covered more than one lesson and are not in this table: one help",
                "event cannot be apportioned to one of several pages without inventing the split.",
            ]

    lines += ["", "## Top 10 stuck points", ""]
    rows = stuck_rows(people)
    if not rows:
        lines += [
            "_Empty._ Each row becomes a course change, with the page that changed and the check that keeps it fixed.",
            "",
            "| # | Lesson | Stuck type | Count | What changed |",
            "| ---: | :--- | :--- | ---: | :--- |",
        ]
    else:
        lines += [
            "From the records' own `stops`, most frequent first. A stall that resolved is still a stall; the fix",
            "each row becomes is recorded in the issue that named it and in [`CHANGELOG.md`](../CHANGELOG.md).",
            "",
            "| # | Lesson | Stuck type | Count | What changed |",
            "| ---: | :--- | :--- | ---: | :--- |",
        ]
        for index, (page, kind, count) in enumerate(rows, start=1):
            lines.append(f"| {index} | `{page}` | {kind} | {count} | — |")

    lines += ["", "## Before / after on revised pages", ""]
    if total == 0:
        lines.append(
            "_Empty._ For each page revised from pilot evidence: the first-attempt result before, the result after,"
        )
        lines.append("and N for both.")
    else:
        lines.append(
            "_Not derivable from the records._ A revision is a diff against the page, so the before/after pair is"
        )
        lines.append("read from git and written by hand next to the change; the records say only what happened.")

    lines += ["", "## Delayed transfer", ""]
    asked = [person for person in people if person["asked"]]
    if not asked:
        lines.append("_Empty._ Attempts made 7–14 days after the lesson, and how many passed.")
    else:
        passed = sum(1 for person in asked if person["transfer"] == "pass")
        failed = sum(1 for person in asked if person["transfer"] == "fail")
        waiting = sum(1 for person in asked if not person["transfer"])
        lines += [
            "Asked 7–14 days after the lesson, and only about a concept learned at least a week before: an",
            "immediate question measures memory. A fail is a finding about the page, published as one.",
            "",
            "| Asked | Passed | Failed | Waiting for the answer |",
            "| ---: | ---: | ---: | ---: |",
            f"| {len(asked)} | {passed} | {failed} | {waiting} |",
        ]

    lines += [
        "",
        "## Limitations",
        "",
        "_Empty._ Every results stage states its own: self-selection, author-as-observer, small N, and anything",
        "learned by watching rather than counting.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Render docs/pilot-results.md from the participant folders.")
    parser.add_argument("--check", action="store_true", help="fail if the committed page is stale")
    parser.add_argument("--out", metavar="PATH", help="write here instead of docs/pilot-results.md")
    args = parser.parse_args(argv)

    people, not_counted = participants()
    text = render(people, not_counted)
    target = os.path.abspath(args.out) if args.out else OUT
    try:
        relative = os.path.relpath(target, ROOT)
    except ValueError:
        relative = target
    # A file written outside the repository is named by its own path; `../../tmp/x.md` is true and unhelpful.
    shown = target if relative.startswith("..") else relative

    if args.check:
        try:
            with open(target, encoding="utf-8") as handle:
                current = handle.read()
        except OSError:
            print(f"{shown} is missing; run python3 scripts/pilot_results.py")
            return 1
        if current != text:
            print(f"{shown} is stale; run python3 scripts/pilot_results.py")
            return 1
        print(f"{shown} is current ({len(people)} participant(s) counted)")
        return 0

    try:
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(text)
    except OSError as error:
        print(f"[FAIL] cannot write {shown}: {error}")
        return 2
    print(f"wrote {shown} ({len(people)} participant(s) counted)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
