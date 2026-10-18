#!/usr/bin/env python3
"""Generate `docs/SIM_ROUTE.md`: the required simulation route, with hours read from metadata.

The route is the one thing a beginner is asked to finish, so it lives in a single generated
document rather than being inferred from 46 module pages. Two rules make that honest:

1. **Hours come from the files, not from this script.** A module's `est_hours` frontmatter and a
   prose lesson's `typical_hours` / `slow_learner_hours` ranges are the only sources; the script
   sums them and prints a range where the metadata gives one. It never invents a duration.
2. **Every module is classified exactly once.** `CORE_MODULES` is the required route; every other
   module on disk is listed under Extensions. A new module cannot appear in neither column, and a
   Core id that names no file is a hard error.

Usage:
    python3 scripts/generate_sim_route.py            # rewrite docs/SIM_ROUTE.md
    python3 scripts/generate_sim_route.py --check     # exit 1 if the document is stale
"""

import argparse
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "SIM_ROUTE.md")
PILOT_RESULTS = os.path.join(ROOT, "docs", "pilot-results.md")

# The one claim this page makes about evidence, and the only three values it may take:
# `unvalidated` (hours are intent), `author-dogfood` (the author has run every page), and
# `pilot-validated` (5+ non-author participants finished the route, counted in pilot-results.md).
# A claim about other people needs other people; the gate below is what stops the third value
# being typed in early.
ROUTE_STATUS = "author-dogfood"
STATUS_LEVELS = ("unvalidated", "author-dogfood", "pilot-validated")
PILOT_MIN_PARTICIPANTS = 5
STATUS_SENTENCE = {
    "unvalidated": "every hour below is intent, not evidence, because nobody has run this route yet",
    "author-dogfood": "the author has run every page and no outside learner has finished this route, so every hour is a target rather than a measurement",
    "pilot-validated": "outside learners have finished this route, counted in docs/pilot-results.md, so the hours below are measured rather than intended",
}

# The required simulation route. Chooses breadth of foundations, then depth along one line:
# rotations -> Joseph/ESKF -> constrained control -> one capstone. Everything not listed here is
# an Extension: still available, still badgeable, not required to finish the course.
CORE_MODULES = [
    # Tier 1 - every track's bridge, because each one supplies the plant or the units Tier 2 uses.
    "00-foundations.T1.00a", "00-foundations.T1.00b", "00-foundations.T1.00c",
    "00-foundations.T1.00d", "00-foundations.T1.00e",
    "01-electronics.T1.01a", "01-electronics.T1.01b", "01-electronics.T1.01c",
    "01-electronics.T1.01d",
    "02-mechanics.T1.02a", "03-sensors.T1.03a", "04-embedded.T1.04a", "04-embedded.T1.04b",
    "05-control.T1.05a", "06-robotics.T1.06a", "07-systems.T1.07a",
    # Tier 2 - the foundations ladder on the arm plant, then control and estimation.
    "00-foundations.T2.00a", "00-foundations.T2.00g", "00-foundations.T2.00b",
    "00-foundations.T2.00c", "00-foundations.T2.00d", "00-foundations.T2.00h",
    "00-foundations.T2.00e", "00-foundations.T2.00f",
    "01-electronics.T2.01a", "01-electronics.T2.01b",
    "02-mechanics.T2.02a", "03-sensors.T2.03a",
    "04-embedded.T2.04a", "04-embedded.T2.04b",
    "05-control.T2.05a", "06-robotics.T2.06a", "06-robotics.T2.06b", "07-systems.T2.07a",
    # Tier 3 - one depth line: rotation foundations, covariance, ESKF reset, constrained control,
    # then the single simulation capstone that exercises all four.
    "00-foundations.T3.00a", "02-mechanics.T3.02a",
    "05-control.T3.05a", "05-control.T3.05b", "05-control.T3.05c",
    "08-capstones.T3.07a",
]

# Modules moved out of Core on purpose, with the sentence that has to justify each one on the
# generated page. A module here is still graded and badgeable; it is simply not required, because
# the Core route's own projects can be finished without it.
OPTIONAL_REASONS = {
    "04-embedded.T2.04c": (
        "Zephyr is a second RTOS toolchain (west, devicetree, Kconfig) on top of the FreeRTOS unit "
        "that already teaches preemption, priority inversion and a static kernel; the Core's timing "
        "work needs the concepts, not a second build system."
    ),
    "04-embedded.T2.04d": (
        "micro-ROS bridges a microcontroller to a ROS 2 graph, and the Core's integration checkpoint "
        "runs trajectory, estimator and controller on the plant in the browser; the bridge is real "
        "work but nothing on the required route consumes it."
    ),
}

# Prose tracks that ship before any module: Python from zero, then the electricity intuition.
# Order matters; ids are the lesson_id frontmatter values.
CORE_TRACKS = [
    ("Track P - programming from zero", "track-p/*.md", "P.M"),
    ("Stage 0 - why electricity behaves like flow", "stage-0/*.md", None),
]


def frontmatter(path):
    """The leading `---` block as a dict of scalars (lists are kept as raw text)."""
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return {}
    data = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep and not line.startswith(" "):
            data[key.strip()] = value.strip().strip('"')
    return data


def parse_hours(spec):
    """'1.0-1.5' -> (1.0, 1.5); '3.0' -> (3.0, 3.0); missing -> None."""
    if not spec:
        return None
    found = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", spec)]
    if not found:
        return None
    return (found[0], found[1] if len(found) > 1 else found[0])


def module_rows():
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "modules", "*.md"))):
        meta = frontmatter(path)
        ident = meta.get("id", "")
        if not ident:
            continue
        hours = parse_hours(meta.get("est_hours", ""))
        rows.append(
            {
                "id": ident,
                "title": meta.get("title", "").strip('"'),
                "tier": meta.get("tier", ""),
                "low": hours[0] if hours else None,
                "high": hours[1] if hours else None,
            }
        )
    return rows


def track_rows(pattern, stop_before):
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
        meta = frontmatter(path)
        ident = meta.get("lesson_id", "")
        if not ident or (stop_before and ident == stop_before):
            continue
        typical = parse_hours(meta.get("typical_hours", ""))
        slow = parse_hours(meta.get("slow_learner_hours", ""))
        rows.append(
            {
                "id": ident,
                "title": meta.get("title", "").strip('"'),
                "low": typical[0] if typical else None,
                "high": (slow[1] if slow else (typical[1] if typical else None)),
            }
        )
    return rows


def fmt(hours_low, hours_high):
    if hours_low is None or hours_high is None:
        return "-"
    if abs(hours_low - hours_high) < 1e-9:
        return f"{hours_low:g}"
    return f"{hours_low:g}-{hours_high:g}"


def participants_from_results(path=PILOT_RESULTS):
    """The non-author participant count declared in `docs/pilot-results.md`, or 0 if it says nothing."""
    if not os.path.exists(path):
        return 0
    with open(path, "r", encoding="utf-8") as handle:
        match = re.search(r"Participants \(non-author\):\s*\**\s*(\d+)", handle.read())
    return int(match.group(1)) if match else 0


def status_findings(status, participants):
    """Why a status claim is not supported yet. Empty list means it is."""
    problems = []
    if status not in STATUS_LEVELS:
        problems.append(
            f"route status `{status}` is not one of {STATUS_LEVELS}: the field may not say anything else"
        )
    if status == "pilot-validated" and participants < PILOT_MIN_PARTICIPANTS:
        problems.append(
            f"route status `pilot-validated` needs {PILOT_MIN_PARTICIPANTS}+ non-author participants "
            f"in docs/pilot-results.md, which declares {participants}"
        )
    return problems


def render():
    findings = status_findings(ROUTE_STATUS, participants_from_results())
    if findings:
        sys.exit("route status claim is unsupported: " + "; ".join(findings))
    modules = module_rows()
    by_id = {row["id"]: row for row in modules}
    missing = [ident for ident in CORE_MODULES if ident not in by_id]
    if missing:
        sys.exit("Core route names modules that do not exist: " + ", ".join(missing))

    core = [by_id[ident] for ident in CORE_MODULES]
    extensions = [row for row in modules if row["id"] not in set(CORE_MODULES)]

    lines = [
        "# The simulation route: what is required, what is optional",
        "",
        "<!-- Generated by scripts/generate_sim_route.py - do not edit by hand.",
        "     Hours are summed from each page's own metadata (`est_hours`, `typical_hours`,",
        "     `slow_learner_hours`); the second column of a range is the slow-learner figure. -->",
        "",
        "Finishing the course means finishing **the Core route** below. Everything under",
        "Extensions is real, graded and badgeable - it is simply not required, so a learner can",
        "stop at Core completion and still hold every skill the Core names.",
        "",
        f"**Route status: `{ROUTE_STATUS}`** — {STATUS_SENTENCE[ROUTE_STATUS]}.",
        "",
        "```mermaid",
        "flowchart LR",
        '    Core["Core route<br/>required"] --> Done["Course complete"]',
        '    Ext["Extensions<br/>optional, still graded"] -.->|"adds hours, costs no requirement"| Done',
        "```",
        "",
        "## Core route (required)",
        "",
        "| Stage | Item | Hours |",
        "| :--- | :--- | ---: |",
    ]

    core_low = core_high = 0.0
    for label, pattern, stop_before in CORE_TRACKS:
        rows = track_rows(pattern, stop_before)
        got = 0.0
        for row in rows:
            lines.append(f"| {label} | `{row['id']}` {row['title']} | {fmt(row['low'], row['high'])} |")
            if row["low"] is not None:
                got += row["high"]
                core_low += row["low"]
        core_high += got
        lines.append(f"| {label} | **{len(rows)} lessons, together** | {fmt(got, got)} |")

    for stage in ("1", "2", "3"):
        rows = [row for row in core if row["tier"] == stage]
        if not rows:
            continue
        low = sum(row["low"] or 0.0 for row in rows)
        high = sum(row["high"] or 0.0 for row in rows)
        core_low += low
        core_high += high
        for row in rows:
            lines.append(f"| Tier {stage} | `{row['id']}` {row['title']} | {fmt(row['low'], row['high'])} |")
        lines.append(f"| Tier {stage} | **{len(rows)} modules, together** | {fmt(low, high)} |")

    lines += [
        f"| **Core total** | **{len(CORE_MODULES)} modules + the prose tracks above** | "
        f"**{fmt(round(core_low, 2), round(core_high, 2))}** |",
        "",
        "The low end is every page's `est_hours` / `typical_hours`; the high end is its",
        "`slow_learner_hours`. Nothing in this table is hand-entered, and `--check` fails when it",
        "drifts from the pages.",
        "",
        "## Extensions (optional, still graded)",
        "",
        "| Tier | Item | Hours |",
        "| :--- | :--- | ---: |",
    ]
    ext_low = ext_high = 0.0
    for row in extensions:
        ext_low += row["low"] or 0.0
        ext_high += row["high"] or 0.0
        lines.append(f"| {row['tier']} | `{row['id']}` {row['title']} | {fmt(row['low'], row['high'])} |")
    lines += [
        f"| - | **{len(extensions)} modules** | **{fmt(round(ext_low, 2), round(ext_high, 2))}** |",
        "",
        "Each extension keeps its own graded package, Break-it case and badge. Taking one adds",
        "hours; skipping one costs nothing on the Core route.",
        "",
        "## Why this split",
        "",
        "- Every Tier 1 bridge is required because each one supplies the plant, the units or the",
        "  tool that Tier 2 assumes.",
        "- Every Tier 2 module on the route is required because the Tier 3 depth line uses it: the",
        "  covariance and ESKF work sits on the linear-algebra and estimation ladder, and the",
        "  constrained-control module sits on the control ladder. The two exceptions are named below,",
        "  with the sentence that earns each one.",
        "- Tier 3 requires one depth line - rotation foundations, Joseph covariance, ESKF reset,",
        "  constrained control, one simulation capstone - so a learner reaches a working",
        "  estimation-and-safety stack without first finishing every capstone.",
        "",
        "## Why two Tier 2 modules are optional",
        "",
    ]
    for ident, reason in OPTIONAL_REASONS.items():
        title = by_id[ident]["title"] if ident in by_id else ""
        lines.append(f"- **`{ident}`** ({title}): {reason}")
    lines += [
        "",
        "Both stay in their track's ladder, keep their graded package and their badge, and keep their",
        "browser-verifiable exercise - moving them changes what is required, not what exists.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if docs/SIM_ROUTE.md is stale")
    args = parser.parse_args(argv)

    text = render()
    if args.check:
        if not os.path.exists(OUT):
            print("docs/SIM_ROUTE.md is missing; run scripts/generate_sim_route.py")
            return 1
        with open(OUT, encoding="utf-8") as handle:
            if handle.read() != text:
                print("docs/SIM_ROUTE.md is stale; run scripts/generate_sim_route.py")
                return 1
        print("docs/SIM_ROUTE.md is current")
        return 0

    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
