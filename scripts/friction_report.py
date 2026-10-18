#!/usr/bin/env python3
"""Turn exported learning logs into `docs/friction-report.md`.

The workbench records what a learner actually did (opens, runs, failed assertions, hints, solution
peeks, verifications) into localStorage, and the header's **Export Learning Log (.json)** button hands
it to the learner. This script is the other half: it reads those files and says, per unit, where the
course is hard in a way the page cannot see.

Nothing here is a guess and nothing is a percentage without its count. The measures are:

- **attempts to verify** - runs before the first `verified`, per lesson that was verified. P50 and P80
  across lessons; a P80 above 8 attempts is a red flag, because it means one learner in five needed
  nine runs.
- **help used** - the share of opened lessons where the learner reached hint 3 or loaded the solution.
  Above 35% is a red flag: the hint ladder is meant to be occasional.
- **unfinished** - opened and never verified at export. Above 10% is a red flag.
- **first failure** - the first failed assertion message per lesson, aggregated. One message starting
  most people's failures is a red flag: that is a missing paragraph, not a weak cohort.
- **time to first success** - first open to first verify, in minutes.

The published page is empty until logs exist, and says so with N = 0 rather than an empty table that
could be read as a good result.

Usage:
    python3 scripts/friction_report.py                       # rewrite the empty (N = 0) page
    python3 scripts/friction_report.py logs/a.json logs/b.json
    python3 scripts/friction_report.py --check                # exit 1 if the page is stale

Exit codes: `0` ok, `1` stale page or unreadable log, `2` wrong command line.
Exit-code family: typed.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import sys
from statistics import median

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "friction-report.md")
SCHEMA = "mechalab.learning-log/1"

# Red flags, from the plan's "what to fix" list. They are thresholds on measures, not opinions about
# learners, and each one names the thing it probably means in the page above.
IDLE_GAP_MS = 15 * 60 * 1000  # a gap longer than this is a break, not thinking
P80_ATTEMPTS_LIMIT = 8
HELP_SHARE_LIMIT = 0.35
UNFINISHED_LIMIT = 0.10
FIRST_FAIL_SHARE_LIMIT = 0.50


def load_events(paths):
    events = []
    for path in paths:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if payload.get("schema") != SCHEMA:
            raise ValueError(f"{path}: schema {payload.get('schema')!r} is not {SCHEMA!r}")
        for event in payload.get("events", []):
            if isinstance(event, dict) and isinstance(event.get("t"), (int, float)):
                events.append(event)
    events.sort(key=lambda e: e["t"])
    return events


def percentile(values, fraction):
    """Nearest-rank percentile: no interpolation, so every published number is an observed attempt."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, min(len(ordered), math.ceil(fraction * len(ordered))))
    return ordered[rank - 1]


def per_lesson(events):
    """One record per lesson id, in first-open order."""
    lessons = {}
    for event in events:
        lesson = event.get("lesson")
        if not lesson:
            continue
        record = lessons.setdefault(
            lesson,
            {
                "id": lesson,
                "opens": 0,
                "runs": 0,
                "attempts": None,
                "verified": False,
                "max_hint": 0,
                "solutions": 0,
                "first_open": None,
                "first_verified": None,
                "first_fail": None,
                "failures": [],
            },
        )
        kind = event.get("kind")
        if kind == "lesson_open":
            record["opens"] += 1
            record["first_open"] = record["first_open"] or event["t"]
        elif kind == "run":
            record["runs"] += 1
            if event.get("fail"):
                record["failures"].append(event["fail"])
                if record["first_fail"] is None:
                    record["first_fail"] = event["fail"]
        elif kind == "verified":
            record["verified"] = True
            record["first_verified"] = record["first_verified"] or event["t"]
            if record["attempts"] is None:
                record["attempts"] = record["runs"]
        elif kind == "hint":
            record["max_hint"] = max(record["max_hint"], int(event.get("level") or 0))
        elif kind == "solution_open":
            record["solutions"] += 1
    return list(lessons.values())


def minutes(first, last):
    if first is None or last is None:
        return None
    return round((last - first) / 60000.0, 1)


def summarize(events):
    records = per_lesson(events)
    opened = [r for r in records if r["opens"]]
    verified = [r for r in records if r["verified"]]
    attempts = [r["attempts"] for r in verified if r["attempts"]]
    helped = [r for r in opened if r["max_hint"] >= 3 or r["solutions"]]
    unfinished = [r for r in opened if not r["verified"]]
    times = [minutes(r["first_open"], r["first_verified"]) for r in verified]
    times = [t for t in times if t is not None]
    fails = {}
    for record in opened:
        if record["first_fail"] and not record["verified"]:
            fails[record["first_fail"]] = fails.get(record["first_fail"], 0) + 1
    total_failures = sum(fails.values())
    top_fail = max(fails.items(), key=lambda kv: (kv[1], kv[0]), default=(None, 0))
    gaps = [
        events[i]["t"] - events[i - 1]["t"]
        for i in range(1, len(events))
        if 0 <= events[i]["t"] - events[i - 1]["t"] <= IDLE_GAP_MS
    ]
    return {
        "events": len(events),
        "opened": len(opened),
        "verified": len(verified),
        "attempts_p50": percentile(attempts, 0.50),
        "attempts_p80": percentile(attempts, 0.80),
        "help_share": (len(helped) / len(opened)) if opened else None,
        "unfinished_share": (len(unfinished) / len(opened)) if opened else None,
        "median_minutes_to_first_success": median(times) if times else None,
        "top_fail": top_fail[0],
        "top_fail_count": top_fail[1],
        "top_fail_share": (top_fail[1] / total_failures) if total_failures else None,
        "active_minutes": round(sum(gaps) / 60000.0, 1) if gaps else 0.0,
        "records": records,
    }


def flags(summary):
    out = []
    if summary["attempts_p80"] is not None and summary["attempts_p80"] > P80_ATTEMPTS_LIMIT:
        out.append(
            f"**Attempts**: P80 is {summary['attempts_p80']} runs, above the {P80_ATTEMPTS_LIMIT} limit — "
            "one learner in five needed more than eight tries on a unit."
        )
    if summary["help_share"] is not None and summary["help_share"] > HELP_SHARE_LIMIT:
        out.append(
            f"**Help**: {summary['help_share']:.0%} of opened units reached hint 3 or the solution, "
            f"above the {HELP_SHARE_LIMIT:.0%} limit — the ladder is being used as the answer key."
        )
    if summary["unfinished_share"] is not None and summary["unfinished_share"] > UNFINISHED_LIMIT:
        out.append(
            f"**Unfinished**: {summary['unfinished_share']:.0%} of opened units were never verified, "
            f"above the {UNFINISHED_LIMIT:.0%} limit."
        )
    if (
        summary["top_fail_share"] is not None
        and summary["top_fail_share"] > FIRST_FAIL_SHARE_LIMIT
        and summary["top_fail_count"] >= 3
    ):
        out.append(
            f"**First failure**: {summary['top_fail_count']} units fail first on the same line "
            f"(`{summary['top_fail']}`), {summary['top_fail_share']:.0%} of all first failures — "
            "suspect a missing paragraph before suspecting the learner."
        )
    return out


def render(summary, sources):
    if not summary["events"]:
        return (
            "# Friction report — **no learning logs yet**\n\n"
            "<!-- Generated by scripts/friction_report.py - do not edit by hand. -->\n\n"
            "> **This page contains no data.** No exported learning log has been processed, so every\n"
            "> measure below is undefined rather than zero: N = 0 learners, 0 events. The workbench's\n"
            "> **Export Learning Log (.json)** button produces the input; this script turns it into the\n"
            "> table a revision is planned from.\n\n"
            "```mermaid\n"
            "flowchart LR\n"
            '    L["Learner runs a unit<br/>in the workbench"] --> E["Export Learning Log<br/>(.json, local only)"]\n'
            '    E --> R["scripts/friction_report.py"]\n'
            '    R --> P["This page:<br/>attempts, help, unfinished,\\nfirst failure"]\n'
            '    P --> F["Rewrite the flagged unit,<br/>then re-measure"]\n'
            "```\n\n"
            "## What it will measure\n\n"
            "| Measure | Red flag | Why that number |\n"
            "| :--- | :--- | :--- |\n"
            f"| Attempts to verify (P50 / P80) | P80 > {P80_ATTEMPTS_LIMIT} | One learner in five needing nine runs means the lesson, not the learner |\n"
            f"| Help used (hint 3 or solution) | > {HELP_SHARE_LIMIT:.0%} of opened units | The hint ladder is meant to be occasional |\n"
            f"| Unfinished at export | > {UNFINISHED_LIMIT:.0%} of opened units | A unit learners leave is a unit that lost them |\n"
            f"| Most common first failure | > {FIRST_FAIL_SHARE_LIMIT:.0%} of first failures | One shared failure is a missing paragraph |\n"
            "| Median time to first success | none set yet | A first sitting that takes an hour is a different course |\n\n"
            "## Limitations\n\n"
            "- Local only: a learner who clears browser storage, or exports before finishing, contributes a\n"
            "  partial log. The report states how many events it saw for this reason.\n"
            "- No identity, no timestamps beyond the event clock, no code. It cannot say who, only what.\n"
            "- Thresholds are the pilot's, not a validated difficulty model; they move when data says so.\n"
        )

    lines = [
        "# Friction report — from exported learning logs",
        "",
        "<!-- Generated by scripts/friction_report.py - do not edit by hand.",
        "     Re-run: python3 scripts/friction_report.py <exported logs...> -->",
        "",
        f"**{summary['events']} events**, {summary['opened']} units opened, {summary['verified']} verified, "
        f"{summary['active_minutes']} active minutes across the logs read ({', '.join(sources)}).",
        "",
        "## Red flags",
        "",
    ]
    problems = flags(summary)
    if problems:
        lines += [f"- {problem}" for problem in problems]
    else:
        lines.append("- None: every measure is inside its limit.")
    def number(value):
        return "—" if value is None else str(value)

    def share(value):
        return "—" if value is None else format(value, ".0%")

    top_fail = "—" if summary["top_fail"] is None else f"{summary['top_fail']} ({summary['top_fail_count']} units)"
    lines += [
        "",
        "## Measures",
        "",
        "| Measure | Value | Limit |",
        "| :--- | ---: | :--- |",
        f"| Attempts to verify, P50 | {number(summary['attempts_p50'])} | — |",
        f"| Attempts to verify, P80 | {number(summary['attempts_p80'])} | ≤ {P80_ATTEMPTS_LIMIT} |",
        f"| Help used (hint 3 or solution) | {share(summary['help_share'])} | ≤ {HELP_SHARE_LIMIT:.0%} |",
        f"| Unfinished at export | {share(summary['unfinished_share'])} | ≤ {UNFINISHED_LIMIT:.0%} |",
        f"| Median minutes to first success | {number(summary['median_minutes_to_first_success'])} | — |",
        f"| Most common first failure | {top_fail} | not one line for most |",
        "",
        "## Per unit",
        "",
        "| Unit | Opens | Runs | Attempts to verify | Hint reached | Solution | Verified | First failure |",
        "| :--- | ---: | ---: | ---: | ---: | ---: | :--- | :--- |",
    ]
    for record in summary["records"]:
        failure = (record["first_fail"] or "—").replace("|", "\\|")[:90]
        lines.append(
            f"| `{record['id']}` | {record['opens']} | {record['runs']} | "
            f"{record['attempts'] if record['attempts'] is not None else '—'} | {record['max_hint']} | "
            f"{record['solutions']} | {'yes' if record['verified'] else 'no'} | {failure} |"
        )
    lines += [
        "",
        "## Limitations",
        "",
        "- Aggregates only, and only over the logs passed on the command line: a learner who kept the file",
        "  to themselves is not in these numbers.",
        "- `Attempts to verify` counts runs, so a run that crashed before grading still counts as an attempt.",
        f"- Active minutes exclude gaps over {IDLE_GAP_MS // 60000} minutes, which are breaks rather than thinking.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Turn exported learning logs into docs/friction-report.md")
    parser.add_argument("logs", nargs="*", help="exported learning-log JSON files (default: none, writes the N = 0 page)")
    parser.add_argument("--check", action="store_true", help="fail if docs/friction-report.md is stale")
    args = parser.parse_args(argv)

    paths = []
    for pattern in args.logs:
        paths.extend(sorted(glob.glob(pattern)) or [pattern])
    events = load_events(paths) if paths else []
    summary = summarize(events)
    text = render(summary, [os.path.relpath(p, ROOT) for p in paths] or ["no logs"])

    if args.check:
        if not os.path.exists(OUT):
            print("docs/friction-report.md is missing; run scripts/friction_report.py")
            return 1
        with open(OUT, "r", encoding="utf-8") as handle:
            if handle.read() != text:
                print("docs/friction-report.md is stale; run scripts/friction_report.py")
                return 1
        print("docs/friction-report.md is current")
        return 0

    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({summary['events']} events)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
