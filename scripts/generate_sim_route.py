#!/usr/bin/env python3
"""Generate `docs/SIM_ROUTE.md`, `docs/MINIMUM.md` and the README's route figures.

The route is the one thing a beginner is asked to finish, so it lives in a single generated
document rather than being inferred from 46 module pages. The minimum finish is generated the
same way: it is a real subset of the same pages, with its own total, not a hand-typed promise.
Two rules make both honest:

1. **Hours come from the files, not from this script.** A module's `est_hours` frontmatter and a
   prose lesson's `typical_hours` / `slow_learner_hours` ranges are the only sources; the script
   sums them and prints a range where the metadata gives one. It never invents a duration.
2. **Every module is classified exactly once.** `CORE_MODULES` is the required route; every other
   module on disk is listed under Extensions. A new module cannot appear in neither column, and a
   Core id that names no file is a hard error.

Usage:
    python3 scripts/generate_sim_route.py            # rewrite SIM_ROUTE, MINIMUM and README
    python3 scripts/generate_sim_route.py --check     # exit 1 if any of them is stale
"""

import argparse
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import route_model  # noqa: E402  (the learner-facing Step 1-10 model)
OUT = os.path.join(ROOT, "docs", "SIM_ROUTE.md")
DEPTH_OUT = os.path.join(ROOT, "docs", "DEPTH.md")
MINIMUM_OUT = os.path.join(ROOT, "docs", "MINIMUM.md")
README = os.path.join(ROOT, "README.md")
# The README quotes the full route, the minimum finish and the optional total. They are written
# between markers and regenerated here, because the front page is where a beginner decides what to
# finish: a hand-typed total goes stale the first time a module's `est_hours` moves, and a stale
# requirement count is worse than no count at all.
README_MARKER_OPEN = "<!-- sim-route:{name} -->"
README_MARKER_CLOSE = "<!-- /sim-route -->"
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
    "00-foundations.T2.00e", "00-foundations.T2.00f", "00-foundations.T2.00i",
    "00-foundations.T2.00j",
    "01-electronics.T2.01a", "01-electronics.T2.01b",
    "02-mechanics.T2.02a", "03-sensors.T2.03a",
    "04-embedded.T2.04a", "04-embedded.T2.04b",
    "05-control.T2.05a", "07-systems.T2.07a",
    # Tier 3 - one depth line: rotation foundations, covariance, ESKF reset, constrained control,
    # then the single simulation capstone that exercises all four.
    "00-foundations.T3.00a", "02-mechanics.T3.02a",
    "05-control.T3.05a", "05-control.T3.05b", "05-control.T3.05c",
    "08-capstones.T3.07a",
]

# The arm route and the depth pass are disjoint: every Core module is in exactly one. The capstone
# is Tier 3 by id but it is the arm's last page, so the layer test is the shared one in route_model.
ARM_MODULES = [ident for ident in CORE_MODULES if route_model.module_layer(ident) == "arm"]
DEPTH_MODULES = [ident for ident in CORE_MODULES if route_model.module_layer(ident) == "depth"]

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
    "06-robotics.T2.06a": (
        "A local ROS 2 install is the most common place a self-guided beginner stops: it needs a "
        "supported Ubuntu, several GB and a shell, while the 2-DOF arm, its estimator and its "
        "controller all run in the browser. The page keeps its graded exercise and badge; the "
        "Docker and browser walkthroughs teach the node graph without the install."
    ),
    "06-robotics.T2.06b": (
        "This is the operations half of the same ROS 2 toolchain (launch files, rosbag2 replay, "
        "Gazebo integration), so it carries the same install wall as `T2.06a`; nothing later on "
        "the required route opens a ROS 2 shell."
    ),
}

# Prose tracks that ship before any module: Python from zero, then the electricity intuition.
# Order matters; ids are the lesson_id frontmatter values. The Track P milestone (P.M) is part of
# the required route: it is the one lesson that ties the track together, so it is not skipped.
CORE_TRACKS = [
    ("Step 1 - Python and the maths a robot needs", "track-p/*.md", None),
    ("Step 2 - Circuits and your first microcontroller", "stage-0/*.md", None),
    # The 23 lessons in Tracks 00-08 are required pages too. They were missing from this list
    # once, which is how a 178-hour total stood beside a 48-lesson course: the route page summed
    # the two prose tracks and every module, but no lesson inside the tracks themselves.
    ("Steps 3-10 - the arm, one system at a time", "0*-*/0*.md", None),
]

# The minimum viable finish: Track P, Stage 0, every Tier 1 bridge, the five lessons the capstone
# declares as prerequisites, and the capstone itself. It is a real finish - the same simulated arm
# the Core route builds - not a badge for doing less. Its list and hours are generated from the
# same metadata as the full route, so a page that grows moves both totals together.
MINIMUM_LESSON_IDS = ("02.2", "02.3", "04.2", "06.1", "07.1", "08.1")
MINIMUM_MODULE_IDS = tuple(ident for ident in CORE_MODULES if ".T1." in ident)


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


def lesson_order(ident):
    """Numeric-aware sort key: 'P.2' < 'P.10' and 'S0.7' < 'S0.10'. Plain string order puts P.10 first."""
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", ident)]


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
    # Route order follows the lesson numbers, not the filenames, so each lesson sits after the one it
    # hands to (P.2 -> P.3 ... P.9 -> P.10), whatever the files happen to be called.
    rows.sort(key=lambda row: lesson_order(row["id"]))
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


def read_text(path: str) -> str:
    """A file's text, or "" when it is missing: `--check` reports staleness, it does not traceback."""
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return ""


def _route_facts(module_ids: list[str]) -> dict:
    """Sum one route's pages, from the same metadata every generated page renders.

    A route is a set of modules plus the prose lessons in `CORE_TRACKS`. The arm route passes the
    17 arm modules, the depth pass passes the 23 depth modules, and the full course passes both.
    """
    modules = [row for row in module_rows() if row["id"] in set(module_ids)]
    low = high = 0.0
    pages = slow_pages = 0
    lessons = 0
    for _label, pattern, stop_before in CORE_TRACKS:
        for row in track_rows(pattern, stop_before):
            lessons += 1
            if row["low"] is not None:
                low += row["low"]
                high += row["high"]
            pages += 1
            if row["low"] is not None and row["high"] > row["low"]:
                slow_pages += 1
    tiers: dict[str, int] = {}
    for row in modules:
        tier = str(row["tier"])
        tiers[tier] = tiers.get(tier, 0) + 1
        low += row["low"] or 0.0
        high += row["high"] or 0.0
        pages += 1
        if row["low"] is not None and row["high"] > row["low"]:
            slow_pages += 1
    return {"low": round(low, 2), "high": round(high, 2), "tiers": tiers,
            "pages": pages, "slow_pages": slow_pages, "lesson_count": lessons,
            "module_count": len(modules)}


def route_facts() -> dict:
    """The arm route: all 48 prose lessons plus the 17 arm modules. No depth, no Extensions."""
    return _route_facts(ARM_MODULES)


def full_route_facts() -> dict:
    """The arm route plus the depth pass: every Core module and every prose lesson."""
    return _route_facts(CORE_MODULES)


def depth_facts() -> dict:
    """The depth pass on its own: the 23 Tier 2/3 modules, with no prose lessons."""
    modules = [row for row in module_rows() if row["id"] in set(DEPTH_MODULES)]
    low = sum(row["low"] or 0.0 for row in modules)
    high = sum(row["high"] or 0.0 for row in modules)
    return {
        "low": round(low, 2),
        "high": round(high, 2),
        "pages": len(modules),
        "module_count": len(modules),
        "slow_pages": sum(1 for row in modules if row["low"] is not None and row["high"] > row["low"]),
        "tiers": {},
    }


def friendly_range(low: float, high: float) -> str:
    """`200.35, 290` -> `≈200–290`: a front-page figure is a plan, not a decimal claim."""
    return f"≈{int(low + 0.5)}–{int(high + 0.5)}"


def _whole_hours(values: list[float]) -> list[int]:
    """Round a column to whole hours so the parts still add up to the rounded whole.

    Each value moves by less than an hour; the largest remainders get the hours the plain
    `int(value + 0.5)` roundings of the column would otherwise lose or gain.
    """
    total = int(sum(values) + 0.5)
    whole = [int(value) for value in values]
    remaining = total - sum(whole)
    order = sorted(range(len(values)), key=lambda index: (-(values[index] - whole[index]), index))
    for index in order[:remaining]:
        whole[index] += 1
    return whole


def rounded_step_ranges() -> dict[str, tuple[int, int]]:
    """Whole-hour arm ranges per step, allocated so the ten rows add to the arm total.

    The README step table and the `together` rows of `SIM_ROUTE.md` both render these values, so
    the two documents cannot appear to disagree. The page rows and the arm total keep the exact
    sums; only the learner-facing plan figures are whole hours. The depth pass has its own
    document and its own totals, so it never appears in this column.
    """
    steps = route_model.facts()["steps"]
    lows = _whole_hours([float(row["arm_low"]) for row in steps])
    highs = _whole_hours([float(row["arm_high"]) for row in steps])
    return {
        str(row["number"]): (lows[index], highs[index])
        for index, row in enumerate(steps)
    }


def hours_basis(facts: dict) -> str:
    """One clause, lowercase for mid-sentence use, saying what the high end of the range is made of.

    A page with `slow_learner_hours` contributes a second estimate; a page with only `est_hours`
    contributes the same number to both ends. Saying which is which, from the metadata itself, is
    the difference between "the high end is a slow-learner figure" and the truth: a floor that will
    rise as pages are measured.
    """
    missing = facts["pages"] - facts["slow_pages"]
    if missing <= 0:
        return ("the route's high end is the slow-learner figure on every page, so it is the one "
                "to plan a calendar against")
    return (f"the route's high end is a slow-learner figure on {facts['slow_pages']} of "
            f"{facts['pages']} pages and a single estimate on the other {missing}, so plan against "
            f"it as a floor and expect it to rise as those pages are measured")


def minimum_facts() -> dict:
    """The smallest route that still ends in a working, verified 2-DOF arm.

    Read from the Step model rather than a second hand-kept list: Step 1 and Step 2 in full, the
    Tier 1 bridge module in every step, the capstone's own declared prerequisites, and the
    capstone. The returned rows carry their links, so `docs/MINIMUM.md` is a page-by-page route.
    """
    steps = route_model.facts()["steps"]
    lessons = list(steps[0]["lessons"]) + list(steps[1]["lessons"])
    lesson_by_id = {}
    for step in steps:
        for row in step["lessons"]:
            lesson_by_id[row["id"]] = row
    missing_lessons = [ident for ident in MINIMUM_LESSON_IDS if ident not in lesson_by_id]
    if missing_lessons:
        sys.exit(
            "the minimum finish names lessons that are in no step: "
            + ", ".join(missing_lessons)
            + "; add each to the right step in scripts/route_model.py"
        )
    arm_lessons = [lesson_by_id[ident] for ident in MINIMUM_LESSON_IDS]

    modules = []
    for step in steps:
        for row in step["modules"]:
            if row["id"] in set(MINIMUM_MODULE_IDS):
                modules.append(row)
    missing_modules = sorted(set(MINIMUM_MODULE_IDS) - {row["id"] for row in modules})
    if missing_modules:
        sys.exit(
            "the minimum finish names modules that are in no step: "
            + ", ".join(missing_modules)
            + "; check CORE_MODULES and scripts/route_model.py"
        )

    rows = lessons + arm_lessons + modules
    low = round(sum(row["low"] or 0.0 for row in rows), 2)
    high = round(sum(row["high"] or 0.0 for row in rows), 2)
    arm = route_facts()
    full = full_route_facts()
    depth = depth_facts()
    return {
        "lessons": lessons,
        "arm_lessons": arm_lessons,
        "modules": modules,
        "lesson_count": len(lessons) + len(arm_lessons),
        "module_count": len(modules),
        "page_count": len(rows),
        "low": low,
        "high": high,
        "core_low": arm["low"],
        "core_high": arm["high"],
        "core_lesson_count": sum(len(step["lessons"]) for step in steps),
        "core_page_count": arm["pages"],
        "remaining_low": round(arm["low"] - low, 2),
        "remaining_high": round(arm["high"] - high, 2),
        "remaining_lessons": sum(len(step["lessons"]) for step in steps)
        - (len(lessons) + len(arm_lessons)),
        "remaining_modules": len(ARM_MODULES) - len(modules),
        "depth_low": depth["low"],
        "depth_high": depth["high"],
        "depth_modules": depth["module_count"],
        "full_low": full["low"],
        "full_high": full["high"],
        "full_page_count": full["pages"],
    }


def _cell(text: str) -> str:
    """A table cell that cannot split its own row on a stray pipe."""
    return text.replace("|", "\\|")


def _page_link(row: dict, module: bool = False, prefix: str = "") -> str:
    href = f"modules/{row['id']}.md" if module else row["path"]
    return f"[`{row['id']}` {_cell(row['title'])}]({prefix}{href})"


def render_minimum() -> str:
    """`docs/MINIMUM.md`: the exact pages in the smallest finish, and what it leaves out."""
    facts = minimum_facts()
    steps = route_model.facts()["steps"]
    extensions = [row for row in module_rows() if row["id"] not in set(CORE_MODULES)]
    ext_low = sum(row["low"] or 0.0 for row in extensions)
    ext_high = sum(row["high"] or 0.0 for row in extensions)

    lines = [
        "# The minimum viable finish: one working arm",
        "",
        "<!-- Generated by scripts/generate_sim_route.py - do not edit by hand.",
        "     Pages and focused hours come from each page's own metadata. -->",
        "",
        "**This is a real finish, not a consolation prize.** Do Step 1, Step 2, every arm module",
        "in Steps 3-9, the five lessons the capstone opens, and Step 10. That builds and verifies",
        "the same simulated two-joint arm the arm route builds.",
        "",
        "**Everything else is someday.** The arm route adds the remaining prose lessons and the",
        "capstone's graded exercise; the depth pass is a separate, optional document with its own",
        "80 hours; Extensions are a third layer. Stopping at the minimum is a finished project, not",
        "an incomplete course.",
        "",
        "```mermaid",
        "flowchart LR",
        '    Start["Steps 1-2<br/>Python and circuits"] --> Tier1["Tier 1 practice<br/>Steps 3-9"]',
        '    Tier1 --> Prereq["Arm prerequisites<br/>five lessons"] --> Arm["Step 10<br/>one working arm"]',
        "```",
        "",
        "| Where | Page | Focused hours |",
        "| :--- | :--- | ---: |",
    ]

    def add(label: str, row: dict, module: bool = False) -> None:
        lines.append(
            f"| {label} | {_page_link(row, module=module, prefix='../')} | "
            f"{fmt(row['low'], row['high'])} |"
        )

    for row in steps[0]["lessons"]:
        add("Step 1", row)
    for row in steps[1]["lessons"]:
        add("Step 2", row)
    for step in steps[2:]:
        for row in step["modules"]:
            if row["id"] in set(MINIMUM_MODULE_IDS):
                add(f"Step {step['number']}", row, module=True)
    for row in facts["arm_lessons"]:
        add("Step 10" if row["id"] == "08.1" else "Arm prerequisites", row)

    lines += [
        f"| **Minimum viable finish** | **{facts['page_count']} pages: "
        f"{facts['lesson_count']} lessons + {facts['module_count']} modules** | "
        f"**{fmt(facts['low'], facts['high'])}** |",
        "",
        "At **6 focused hours a week** the page time is about 4-6 months. Add the first-time",
        "overhead the README explains (5x focused hours) and plan **1.5-2.5 years**; at 10x it is",
        "3-5 years. The arm route is about 3-5 years at 6 hours a week with the same 5x.",
        "",
        "## What the minimum leaves out",
        "",
        f"- **{facts['remaining_lessons']} prose lessons and the capstone's graded exercise**, "
        f"{friendly_range(facts['remaining_low'], facts['remaining_high'])} focused hours: the rest "
        "of the arm route in [`SIM_ROUTE.md`](SIM_ROUTE.md). They are arm reading, not depth work.",
        f"- **{facts['depth_modules']} depth modules**, {fmt(facts['depth_low'], facts['depth_high'])} "
        "focused hours: the separate depth pass in [`DEPTH.md`](DEPTH.md), taken after the arm.",
        f"- **{len(extensions)} optional Extensions**, "
        f"{fmt(round(ext_low, 2), round(ext_high, 2))} focused hours. None is required for any",
        "  finish line.",
        "- **Physical hardware and a local ROS 2 install.** Every page in the minimum runs in the",
        f"  browser. The optional bench and the ROS 2 walkthrough are in `docs/EXTENSIONS.md`.",
        "",
        "## What the arm route adds",
        "",
        f"The arm route is **{facts['core_low']:g}-{facts['core_high']:g} focused hours**: "
        f"{len(ARM_MODULES)} arm modules and all {facts['core_lesson_count']} lessons "
        f"({facts['core_page_count']} pages). It is the same arm with all of its reading and the "
        f"capstone's graded exercise, not a different project.",
        "",
        "The depth pass is a second, optional route: "
        f"**{facts['depth_modules']} modules, {facts['depth_low']:g}-{facts['depth_high']:g} focused "
        "hours**, page by page in [`DEPTH.md`](DEPTH.md). The full course is the arm plus the depth "
        f"pass, **{facts['full_low']:g}-{facts['full_high']:g} focused hours**.",
        "",
    ]
    return "\n".join(lines)


def _replace_marker(text: str, name: str, value: str) -> str:
    """Replace every `<!-- sim-route:NAME -->…<!-- /sim-route -->` block, or refuse to guess."""
    open_tag = README_MARKER_OPEN.format(name=name)
    pattern = re.compile(re.escape(open_tag) + r".*?" + re.escape(README_MARKER_CLOSE), re.S)
    if not pattern.search(text):
        sys.exit(
            f"README.md has no {open_tag} marker, so the value it quotes cannot be generated; "
            f"restore the marker around the figure (the hours range and the Tier 2 count each "
            f"need one)"
        )
    return pattern.sub(lambda _match: f"{open_tag}{value}{README_MARKER_CLOSE}", text)


def render_readme(text: str | None = None) -> str:
    """The README with its route figures rewritten from `route_facts()`.

    Two markers carry the hours (the first paragraph and the requirement note), so the same name is
    replaced everywhere it appears. The required-module count and the optional half (count and
    hours) are generated too: they are the numbers a moved module changes first.
    """
    if text is None:
        text = read_text(README)
    facts = route_facts()
    full = full_route_facts()
    depth = depth_facts()
    minimum = minimum_facts()
    hours = friendly_range(facts["low"], facts["high"])
    full_hours = friendly_range(full["low"], full["high"])
    minimum_hours = friendly_range(minimum["low"], minimum["high"])
    split = route_model.facts()
    extensions = [row for row in module_rows() if row["id"] not in set(CORE_MODULES)]
    ext_low = sum(row["low"] or 0.0 for row in extensions)
    ext_high = sum(row["high"] or 0.0 for row in extensions)
    ext_hours = fmt(round(ext_low, 2), round(ext_high, 2)).replace("-", "–")
    text = _replace_marker(text, "hours", f"**{hours} focused hours**")
    text = _replace_marker(text, "full-hours", f"**{full_hours} with the optional depth pass**")
    text = _replace_marker(
        text, "depth-hours", f"**{fmt(depth['low'], depth['high'])} focused hours**"
    )
    text = _replace_marker(text, "minimum", f"**{minimum_hours} focused hours**")
    text = _replace_marker(text, "minimum-pages", str(minimum["page_count"]))
    text = _replace_marker(
        text,
        "modules",
        f"**{split['arm_module_count']} arm + {split['depth_module_count']} depth modules**",
    )
    text = _replace_marker(
        text, "extensions", f"**{len(extensions)} optional modules ({ext_hours} focused hours)**"
    )
    text = _replace_marker(text, "hours-basis", hours_basis(facts))
    return text


def render():
    facts = route_facts()
    findings = status_findings(ROUTE_STATUS, participants_from_results())
    if findings:
        sys.exit("route status claim is unsupported: " + "; ".join(findings))
    modules = module_rows()
    by_id = {row["id"]: row for row in modules}
    missing = [ident for ident in ARM_MODULES if ident not in by_id]
    if missing:
        sys.exit("Arm route names modules that do not exist: " + ", ".join(missing))

    core = [by_id[ident] for ident in ARM_MODULES]
    split = route_model.facts()
    core_lessons = split["lesson_count"]

    lines = [
        "# The arm route: ten steps to one working arm",
        "",
        "<!-- Generated by scripts/generate_sim_route.py - do not edit by hand.",
        "     Focused hours are summed from each page's own metadata (`est_hours`,",
        "     `typical_hours`, `slow_learner_hours`); the second column of a range is the",
        "     slow-learner figure. They exclude setup, debugging and re-reading. -->",
        "",
        "This page is the **arm route only**: all the prose lessons, every Tier 1 bridge, and the",
        "capstone. It contains no depth modules and no Extensions, so nothing on it is optional.",
        "Take Steps 1-10 in order and stop at the working arm.",
        "",
        "After it, there are two further layers, each with its own generated page: the **depth",
        "pass** in [`DEPTH.md`](DEPTH.md) (23 Tier 2/3 modules, taken in the same step order) and",
        "the **Extensions** in [`EXTENSIONS.md`](EXTENSIONS.md). Neither is required for the arm.",
        "",
        f"**Arm route total: {friendly_range(facts['low'], facts['high'])} focused hours** for "
        f"{len(ARM_MODULES)} arm modules and all {core_lessons} lessons. The depth pass is "
        f"{fmt(depth_facts()['low'], depth_facts()['high'])} hours; the full course is "
        f"{friendly_range(full_route_facts()['low'], full_route_facts()['high'])}.",
        "",
        f"**Route status: `{ROUTE_STATUS}`** — {STATUS_SENTENCE[ROUTE_STATUS]}.",
        "",
        "Track P's lesson ids skip `P.13` on purpose: saved progress and every link are keyed by",
        "lesson id, so `P.14` keeps the number it shipped with. The gap is not a missing lesson.",
        "",
        "```mermaid",
        "flowchart LR",
        '    Arm["Steps 1-10<br/>arm route"] --> ArmDone["Working arm<br/>a real finish"]',
        '    ArmDone -.-> Depth["Depth pass<br/>DEPTH.md, optional"]',
        '    ArmDone -.-> Ext["Extensions<br/>EXTENSIONS.md, optional"]',
        "```",
        "",
        "## Arm route (required)",
        "",
        "| Stage | Item | Focused hours |",
        "| :--- | :--- | ---: |",
    ]

    core_low = core_high = 0.0
    covered = []
    rounded = rounded_step_ranges()
    for step in route_model.STEPS:
        lessons = route_model.step_lessons(step)
        rows = [row for row in core if row["id"] in set(step["modules"])]
        if not lessons and not rows:
            continue
        covered.extend(row["id"] for row in rows)
        low = sum(row["low"] or 0.0 for row in lessons + rows)
        high = sum(row["high"] or 0.0 for row in lessons + rows)
        core_low += low
        core_high += high
        label = f"Step {step['number']} · {step['title']}"
        for row in lessons:
            lines.append(f"| {label} | `{row['id']}` {row['title']} | {fmt(row['low'], row['high'])} |")
        for row in rows:
            lines.append(
                f"| {label} | `{row['id']}` {row['title']} **· arm** | "
                f"{fmt(row['low'], row['high'])} |"
            )
        parts = []
        if lessons:
            parts.append(f"{len(lessons)} lesson{'s' if len(lessons) != 1 else ''}")
        if rows:
            parts.append(f"{len(rows)} arm module{'s' if len(rows) != 1 else ''}")
        step_low, step_high = rounded[str(step["number"])]
        lines.append(
            f"| {label} | **{' + '.join(parts)}, together** | ≈{step_low}–{step_high} |"
        )
    uncovered = sorted(set(ARM_MODULES) - set(covered))
    if uncovered:
        sys.exit(
            "CORE_MODULES are in no learner step, so the route page cannot label them: "
            + ", ".join(uncovered)
            + "; add them to the right step in scripts/route_model.py"
        )

    minimum = minimum_facts()
    lines += [
        f"| **Arm route total** | **{len(ARM_MODULES)} arm modules + all "
        f"{core_lessons} lessons ({facts['pages']} pages)** | **{fmt(facts['low'], facts['high'])}** |",
        "",
        "These are **focused hours**: time with the page open, excluding setup, debugging and",
        "re-reading. The low end is every page's `est_hours` / `typical_hours`; the high end is",
        "its `slow_learner_hours` where the page states one. The README gives the calendar",
        "estimate these become once first-time overhead is counted.",
        "",
        f"**Estimate coverage:** {hours_basis(facts)[0].upper() + hours_basis(facts)[1:]}.",
        "",
        "Nothing in this table is hand-entered, and `--check` fails when it drifts from the pages.",
        "",
        "The stage rows above are rounded to whole hours with the same allocation as the README's",
        "step table, so `16.75-42.5` appears as `≈17–43` in both places; the page rows and the",
        f"arm total keep the exact sums (`{fmt(facts['low'], facts['high'])}`).",
        "",
        "## What is not on this page",
        "",
        f"- **The depth pass** - {depth_facts()['module_count']} Tier 2/3 modules, "
        f"{fmt(depth_facts()['low'], depth_facts()['high'])} focused hours, in "
        "[`DEPTH.md`](DEPTH.md). Take it after this route, in the same step order. Nothing on this",
        "  page depends on it.",
        f"- **The minimum finish** - {minimum['page_count']} pages, "
        f"{fmt(minimum['low'], minimum['high'])} focused hours, in "
        "[`MINIMUM.md`](MINIMUM.md). A smaller finish that still builds the arm.",
        "- **The Extensions** - 10 optional modules, 47.5 focused hours, in",
        "  [`EXTENSIONS.md`](EXTENSIONS.md). A third layer, outside both routes.",
        "",
        "## Why this split",
        "",
        "- **Every page here is arm work.** Every Tier 1 bridge in Steps 3-9 supplies the plant, the",
        "  units or the tool the next step assumes, and the capstone consumes them.",
        "- **The prose lessons are arm reading.** They are the explanations and predictions each",
        "  practice page assumes; none of them is depth practice.",
        "- **The depth pass is a second route, not a prerequisite.** It returns to Track 00 for the",
        "  Tier 2 foundations ladder, then follows the same step order through each track's Tier 2",
        "  work and the Tier 3 depth line. Nothing the arm checks depends on it.",
        "",
    ]
    return "\n".join(lines)


def render_depth() -> str:
    """`docs/DEPTH.md`: the second pass, with its own page list and total."""
    facts = depth_facts()
    modules = module_rows()
    by_id = {row["id"]: row for row in modules}
    missing = [ident for ident in DEPTH_MODULES if ident not in by_id]
    if missing:
        sys.exit("Depth route names modules that do not exist: " + ", ".join(missing))
    depth = [by_id[ident] for ident in DEPTH_MODULES]
    split = route_model.facts()
    arm = route_facts()
    full = full_route_facts()
    extensions = [row for row in modules if row["id"] not in set(CORE_MODULES)]

    lines = [
        "# The depth pass: the second route, after the arm",
        "",
        "<!-- Generated by scripts/generate_sim_route.py - do not edit by hand.",
        "     Pages and focused hours come from each page's own metadata. -->",
        "",
        "**This is the depth pass, and it is optional.** It is 23 Tier 2/3 modules and "
        f"**{fmt(facts['low'], facts['high'])} focused hours**, taken after the arm route. It is",
        "not part of [`SIM_ROUTE.md`](SIM_ROUTE.md), which contains no depth work at all.",
        "",
        f"The arm route is **{friendly_range(arm['low'], arm['high'])} focused hours**; this pass "
        f"adds **{fmt(facts['low'], facts['high'])}**; the full course is "
        f"**{friendly_range(full['low'], full['high'])} focused hours**. Nothing on the arm route "
        f"depends on",
        "these pages, and skipping all of them still leaves a working arm.",
        "",
        "```mermaid",
        "flowchart LR",
        '    Arm["Arm route<br/>SIM_ROUTE.md"] --> ArmDone["Working arm"]',
        '    ArmDone --> Depth["Depth pass<br/>this page"]',
        '    Depth --> Full["Full course"]',
        "```",
        "",
        "## Depth pass (23 modules)",
        "",
        "| Stage | Item | Focused hours |",
        "| :--- | :--- | ---: |",
    ]

    covered = []
    for step in route_model.STEPS:
        rows = [row for row in depth if row["id"] in set(step["modules"])]
        if not rows:
            continue
        covered.extend(row["id"] for row in rows)
        label = f"Step {step['number']} · {step['title']}"
        for row in rows:
            lines.append(
                f"| {label} | `{row['id']}` {row['title']} **· depth** | "
                f"{fmt(row['low'], row['high'])} |"
            )
        low = sum(row["low"] or 0.0 for row in rows)
        high = sum(row["high"] or 0.0 for row in rows)
        lines.append(
            f"| {label} | **{len(rows)} depth module{'s' if len(rows) != 1 else ''}, "
            f"together** | {fmt(round(low, 2), round(high, 2))} |"
        )

    uncovered = sorted(set(DEPTH_MODULES) - set(covered))
    if uncovered:
        sys.exit(
            "DEPTH_MODULES are in no learner step, so the depth page cannot label them: "
            + ", ".join(uncovered)
            + "; add them to the right step in scripts/route_model.py"
        )

    lines += [
        f"| **Depth pass total** | **{len(DEPTH_MODULES)} modules** | "
        f"**{fmt(facts['low'], facts['high'])}** |",
        "",
        "Each module is still graded, has its own Break-it case and badge, and keeps its",
        "browser-verifiable exercise. Taking the pass adds hours; skipping it costs nothing on",
        "the arm route.",
        "",
        "## Why these modules come second",
        "",
        "- **They extend a Tier 1 bridge, they do not replace it.** The arm route supplies the plant,",
        "  units and tool each one assumes; the depth work then explains why the arm behaves as it",
        "  does.",
        "- **The order is the same ten steps.** Return to Track 00 for the foundations ladder, then",
        "  follow the track order through each track's Tier 2 work and the Tier 3 depth line.",
        "- **Nothing on the arm route consumes them.** The capstone's checks run on the arm route",
        "  alone, so the depth pass can be taken now, later, or not at all.",
        "",
        "## Extensions (a third layer, optional)",
        "",
        "These ten modules are outside every route, not part of the depth total above.",
        "",
        "| Where | Item | Focused hours |",
        "| :--- | :--- | ---: |",
    ]
    ext_low = ext_high = 0.0
    for row in extensions:
        ext_low += row["low"] or 0.0
        ext_high += row["high"] or 0.0
        lines.append(f"| Optional | `{row['id']}` {row['title']} | {fmt(row['low'], row['high'])} |")
    lines += [
        f"| - | **{len(extensions)} modules** | **{fmt(round(ext_low, 2), round(ext_high, 2))}** |",
        "",
        f"## Why {len(OPTIONAL_REASONS)} modules are optional",
        "",
    ]
    for ident, reason in OPTIONAL_REASONS.items():
        title = by_id[ident]["title"] if ident in by_id else ""
        lines.append(f"- **`{ident}`** ({title}): {reason}")
    lines += [
        "",
        "Each stays in its track, keeps its graded package and its badge, and keeps its",
        "browser-verifiable exercise - moving it changes what is required, not what exists.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if a generated route page is stale")
    args = parser.parse_args(argv)

    text = render()
    depth = render_depth()
    minimum = render_minimum()
    readme = render_readme()
    if args.check:
        stale = [
            os.path.relpath(path, ROOT)
            for path, expected in (
                (OUT, text), (DEPTH_OUT, depth), (MINIMUM_OUT, minimum), (README, readme)
            )
            if read_text(path) != expected
        ]
        if stale:
            print(f"{', '.join(stale)} stale; run scripts/generate_sim_route.py")
            return 1
        print("docs/SIM_ROUTE.md, docs/DEPTH.md, docs/MINIMUM.md and README.md are current")
        return 0

    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(text)
    with open(DEPTH_OUT, "w", encoding="utf-8") as handle:
        handle.write(depth)
    with open(MINIMUM_OUT, "w", encoding="utf-8") as handle:
        handle.write(minimum)
    with open(README, "w", encoding="utf-8") as handle:
        handle.write(readme)
    print(
        f"wrote {os.path.relpath(OUT, ROOT)}, {os.path.relpath(DEPTH_OUT, ROOT)}, "
        f"{os.path.relpath(MINIMUM_OUT, ROOT)} and {os.path.relpath(README, ROOT)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
