#!/usr/bin/env python3
"""Check a participant's exported learning log before they leave the room.

The pilot's sheet (`docs/PILOT.md` section 4) is filled from two places: what the observer watched,
and the `mechalab-learning-log-*.json` the participant pressed **Export Learning Log (.json)** to get.
This script reads the second one and answers three questions in ten seconds, while the participant is
still there to export again if something is wrong:

1. **Is this the document we think it is?** The schema is the one `learningLog.ts` declares, the
   events are events, and the sitting clock's array is present. An export from an older build, or a
   renamed file, is caught here rather than three days later in the aggregate.
2. **Do the two instruments agree?** A sitting carries `runs`; the log carries one `run` event per
   execution. When they disagree, one of them missed a write and neither number should be copied
   into the sheet unexamined. `docs/pilot-results.md` Run 214 established that they agree on a clean
   walk, so a disagreement is news, not noise.
3. **What goes in the row?** The line printed under `sheet` is the arithmetic the observer would
   otherwise do by hand: active minutes from the sittings, runs, verified, hints, help type.

It also names the defect class the pilot cannot afford to miss: two `lesson_open` events for one
lesson within a second is a visit counted twice. That was real in development until Run 216 (a
`React.StrictMode` effect replay), and it inflates the abandon-rate denominator that the whole pilot
is built on.

Findings come in two severities. `[FAIL]` means the file cannot be logged as it stands — re-export it
before the participant goes. `[WARN]` means it can be logged, with the line copied into the sheet's
notes, because the finding is itself something the pilot learned.

Usage
    python3 scripts/pilot_preflight.py pilot-data/2026-10-24-ab/mechalab-learning-log-2026-10-24.json
    python3 scripts/pilot_preflight.py pilot-data/*/*.json
    python3 scripts/pilot_preflight.py --json pilot-data/*/*.json

Exit-code family: typed
    0  every export is clean
    1  a finding: read the `[FAIL]` and `[WARN]` lines
    2  the command line or a file could not be read
"""

from __future__ import annotations

import argparse
import json
import os
import sys

SCHEMA = "mechalab.learning-log/1"
# Two opens closer than this are one visit logged twice, not a learner who left and came back: the
# defect Run 216 fixed wrote them 7 ms apart.
REPLAY_WINDOW_MS = 1000
KINDS = ("lesson_open", "run", "verified", "hint", "solution_open", "export")


def load(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def as_events(payload: dict) -> list[dict]:
    events = payload.get("events")
    if not isinstance(events, list):
        return []
    return [event for event in events if isinstance(event, dict) and isinstance(event.get("t"), (int, float))]


def as_sittings(payload: dict) -> list[dict] | None:
    sittings = payload.get("sittings")
    if sittings is None:
        return None
    if not isinstance(sittings, list):
        return None
    return [sitting for sitting in sittings if isinstance(sitting, dict)]


def seconds(ms: float) -> str:
    """`12 min 20 s`, `48 s`, `1 h 4 min` — a duration the observer reads without arithmetic."""
    total = max(0, int(round(ms / 1000)))
    if total < 60:
        return f"{total} s"
    minutes, rest = divmod(total, 60)
    if minutes < 60:
        return f"{minutes} min {rest} s" if rest else f"{minutes} min"
    hours, minutes = divmod(minutes, 60)
    return f"{hours} h {minutes} min" if minutes else f"{hours} h"


def examine(path: str) -> dict:
    """Everything the kit needs about one export: the row's numbers, and what is wrong with it."""
    findings: list[tuple[str, str]] = []
    try:
        payload = load(path)
    except (OSError, ValueError) as error:
        return {"path": path, "findings": [("FAIL", f"cannot be read: {error}")], "sheet": None}

    if payload.get("schema") != SCHEMA:
        findings.append(
            ("FAIL", f"schema is {payload.get('schema')!r}, not {SCHEMA!r} — export from the build the participant used")
        )

    events = as_events(payload)
    sittings = as_sittings(payload)
    if not events:
        findings.append(("FAIL", "no events: nothing was recorded, so there is no row to fill"))
    if sittings is None:
        findings.append(("FAIL", "no `sittings` array: the time column would have to be estimated rather than measured"))
    elif not sittings:
        findings.append(("FAIL", "`sittings` is empty: the participant's activity never reached the clock"))

    # A visit logged twice inflates the denominator every other pilot number is a share of.
    opens_by_lesson: dict[str, list[float]] = {}
    for event in events:
        if event.get("kind") == "lesson_open" and event.get("lesson"):
            opens_by_lesson.setdefault(str(event["lesson"]), []).append(float(event["t"]))
    for lesson, times in opens_by_lesson.items():
        ordered = sorted(times)
        for earlier, later in zip(ordered, ordered[1:]):
            if later - earlier <= REPLAY_WINDOW_MS:
                findings.append(
                    (
                        "WARN",
                        f"{lesson} has two lesson_open events {int(later - earlier)} ms apart — one visit logged twice",
                    )
                )
                break

    unknown = sorted({str(event.get("kind")) for event in events} - set(KINDS))
    if unknown:
        findings.append(("WARN", f"event kinds this script does not know: {', '.join(unknown)}"))

    runs = [event for event in events if event.get("kind") == "run"]
    if not runs:
        findings.append(("WARN", "no `run` events: the participant opened lessons and ran nothing"))

    # The instruments, cross-checked: what the clock counted against what the log recorded.
    if sittings:
        for index, sitting in enumerate(sittings):
            start = float(sitting.get("start", 0))
            end = float(sitting.get("end", start))
            counted = int(sitting.get("runs") or 0)
            logged = sum(1 for event in runs if start <= float(event["t"]) <= end)
            if counted != logged:
                findings.append(
                    (
                        "WARN",
                        f"sitting {index + 1} counts {counted} run(s), the log has {logged} inside it — one of the two missed a write",
                    )
                )

    total_ms = sum(max(0.0, float(s.get("end", 0)) - float(s.get("start", 0))) for s in sittings or [])
    hints = [int(event.get("level") or 0) for event in events if event.get("kind") == "hint"]
    max_hint = max(hints) if hints else 0
    solutions = sum(1 for event in events if event.get("kind") == "solution_open")
    verified = any(event.get("kind") == "verified" for event in events)
    lessons = sorted(opens_by_lesson)
    help_kind = "solution" if solutions else (f"hint_{max_hint}" if max_hint else "none")

    sheet = {
        "lessons": lessons,
        "active_minutes": int(round(total_ms / 60000.0)),
        "sittings": len(sittings or []),
        "opens": sum(len(times) for times in opens_by_lesson.values()),
        "runs": len(runs),
        "hints_used": len(hints),
        "max_hint": max_hint,
        "help": help_kind,
        "verified": verified,
    }
    return {"path": path, "findings": findings, "sheet": sheet, "sittings": sittings or [], "events": events}


def report(result: dict) -> list[str]:
    name = os.path.basename(result["path"])
    sheet = result["sheet"]
    lines = [f"{name}"]
    if sheet is None:
        for severity, message in result["findings"]:
            lines.append(f"  [{severity}] {message}")
        return lines
    lines.append(
        f"  events    {len(result['events'])} · {sheet['opens']} opens, {sheet['runs']} runs, "
        f"{'verified' if sheet['verified'] else 'not verified'}, {sheet['hints_used']} hints, "
        f"{'solution opened' if sheet['help'] == 'solution' else 'no solution'}"
    )
    for index, sitting in enumerate(result["sittings"]):
        start = float(sitting.get("start", 0))
        end = float(sitting.get("end", start))
        lessons = sitting.get("lessons") or []
        lines.append(
            f"  sitting {index + 1} {seconds(end - start)} · {int(sitting.get('runs') or 0)} runs · "
            f"{' '.join(str(lesson) for lesson in lessons[:4]) or 'no lesson named'}"
        )
    if not result["sittings"]:
        lines.append("  sitting   none")
    lines.append(
        f"  sheet     active_minutes {sheet['active_minutes']} · hints_used {sheet['hints_used']} · "
        f"help {sheet['help']} · verified {'yes' if sheet['verified'] else 'no'} · "
        f"lessons {', '.join(sheet['lessons']) or '—'}"
    )
    for severity, message in result["findings"]:
        lines.append(f"  [{severity}] {message}")
    return lines


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Check a participant's exported learning log before they leave the room.",
    )
    parser.add_argument("logs", nargs="+", help="exported learning-log JSON files")
    parser.add_argument("--json", action="store_true", help="machine-readable report on stdout")
    args = parser.parse_args(argv)

    results = []
    unreadable = False
    for path in args.logs:
        if not os.path.exists(path):
            print(f"[FAIL] {path} is not there", file=sys.stderr)
            unreadable = True
            continue
        results.append(examine(path))
    if unreadable:
        return 2

    findings = sum(len(result["findings"]) for result in results)
    if args.json:
        print(json.dumps({"exports": results, "findings": findings}, indent=2, default=str))
    else:
        for result in results:
            print("\n".join(report(result)))
            print()
        fails = sum(1 for result in results for severity, _ in result["findings"] if severity == "FAIL")
        warns = findings - fails
        if findings:
            tag = "FAIL" if fails else "WARN"
            print(f"[{tag}] {findings} finding(s): {fails} FAIL, {warns} WARN")
            if fails:
                print("       A FAIL means the export cannot be logged as it stands: export it again.")
            if warns:
                print("       A WARN can be logged: copy the line into the sheet's notes.")
        else:
            print(f"[PASS] {len(results)} export(s) ready to log")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
