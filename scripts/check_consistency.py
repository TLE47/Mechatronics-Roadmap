#!/usr/bin/env python3
"""Catch contradictions between the lesson files and the pages that quote them.

The failures this exists for are the ones a reader cannot see until they count:

* the README once said "13 Track P lessons and the P.M milestone" beside a generated table of
  fourteen rows;
* the route total omitted the 23 lesson pages inside Tracks 00-08, understating the course by
  about 32 hours;
* a step's count could move in `route_model.py` while the table, the route page and the folder
  README kept yesterday's number.

All counts and hours are derived here from the lesson front matter, `modules/_index.yaml` and
the module pages - never typed in. Run it with no arguments; `--json` prints the findings as
JSON on stdout.

Usage:
    python3.12 scripts/check_consistency.py
    python3.12 scripts/check_consistency.py --json
"""

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generate_sim_route as route  # noqa: E402
import generate_start_here as start_here  # noqa: E402
import route_model  # noqa: E402

README = os.path.join(ROOT, "README.md")
APP_START_HERE = os.path.join(ROOT, "app", "src", "startHere.ts")
APP_LESSON_DATA = os.path.join(ROOT, "app", "src", "data", "pythonLessonsData.ts")
SKIP_FILES = {"CHANGELOG.md"}


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def markdown_files():
    """Every tracked-looking Markdown page except history and generated citation data."""
    for path in sorted(glob.glob(os.path.join(ROOT, "**", "*.md"), recursive=True)):
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        if rel in SKIP_FILES or rel.startswith(("node_modules/", "app/node_modules/")):
            continue
        if "/.git/" in rel:
            continue
        yield rel, path


def facts():
    steps = route_model.facts()
    modules = route_model.all_modules()
    core = route.route_facts()
    full = route.full_route_facts()
    depth = route.depth_facts()
    minimum = route.minimum_facts()
    extensions = [row for row in route.module_rows() if row["id"] not in set(route.CORE_MODULES)]
    ext_hours = route.fmt(
        round(sum(row["low"] or 0.0 for row in extensions), 2),
        round(sum(row["high"] or 0.0 for row in extensions), 2),
    )
    return {
        "steps": steps,
        "lessons": steps["lesson_count"],
        "required_modules": len(route.CORE_MODULES),
        "optional_modules": len(extensions),
        "formal_modules": route_model.module_count_total(),
        "bridge_modules": len(modules),
        "core_low": core["low"],
        "core_high": core["high"],
        "full_low": full["low"],
        "full_high": full["high"],
        "depth_low": depth["low"],
        "depth_high": depth["high"],
        "minimum_low": minimum["low"],
        "minimum_high": minimum["high"],
        "optional_hours": ext_hours,
    }


def check_step_model(f):
    """The learner model and the required-route list have to name the same modules."""
    findings = []
    in_steps = [ident for step in route_model.STEPS for ident in step["modules"]]
    if len(in_steps) != len(set(in_steps)):
        findings.append("route_model.py lists a required module twice; the step totals double-count it")
    missing = sorted(set(route.CORE_MODULES) - set(in_steps))
    extra = sorted(set(in_steps) - set(route.CORE_MODULES))
    if missing:
        findings.append(
            "required modules in no step: " + ", ".join(missing)
            + " - add each to a step in scripts/route_model.py"
        )
    if extra:
        findings.append(
            "step modules that are not on the required route: " + ", ".join(extra)
            + " - a learner would count hours they are not asked to finish"
        )
    if f["steps"]["step_count"] != 10:
        findings.append(
            f"expected 10 learner steps, found {f['steps']['step_count']}; the front page says "
            f"'Steps 1-10'"
        )
    numbers = [step["number"] for step in route_model.STEPS]
    if numbers != list(range(1, 11)):
        findings.append(f"step numbers must run 1..10 in order, got {numbers}")
    return findings


def check_quoted_counts(f):
    """A number quoted in prose must equal the number derived from the files."""
    findings = []
    checks = [
        (r"(\d+)\s+Track P lessons?", f["steps"]["steps"][0]["lesson_count"], "Track P"),
        (r"(\d+)\s+Stage 0 lessons?", f["steps"]["steps"][1]["lesson_count"], "Stage 0"),
        (r"all (\d+) beginner lessons", f["lessons"], "all beginner lessons"),
        (r"(\d+)\s+formal modules", f["formal_modules"], "formal modules"),
        (r"(\d+)\s+bridge modules", f["bridge_modules"], "bridge modules"),
        (r"(\d+)\s+required practice modules", f["required_modules"], "required modules"),
        (r"(\d+)\s+optional modules", f["optional_modules"], "optional modules"),
    ]
    for rel, path in markdown_files():
        text = read(path)
        for pattern, expected, label in checks:
            for match in re.finditer(pattern, text):
                got = int(match.group(1))
                if got != expected:
                    findings.append(
                        f"{rel}: says {got} {label}, the files give {expected} - "
                        f"{match.group(0)!r}"
                    )
    return findings


def check_quoted_hours(f):
    findings = []
    expected_core = (round(f["core_low"]), round(f["core_high"]))
    scoped = {
        "README.md",
        "docs/ROUTE.md",
        "docs/SIM_ROUTE.md",
        "docs/DEPTH.md",
        "docs/EXTENSIONS.md",
        "docs/VERIFICATION.md",
    }
    for rel, path in markdown_files():
        if rel not in scoped:
            continue
        text = read(path)
        for match in re.finditer(r"(\d+)[–-](\d+)\s*(?:focused\s+)?hours", text):
            start = text.rfind("\n", 0, match.start()) + 1
            end = text.find("\n", match.end())
            line = text[start:end if end != -1 else len(text)]
            # "Budget 2-3 hours for the install" is advice, not a course total.
            if "install" in line.lower():
                continue
            got = (int(match.group(1)), int(match.group(2)))
            # Only ranges near the course totals are claims about the course; a lesson may
            # legitimately quote a bench session. Accept the Core or Track P/Stage 0 ranges.
            if got == expected_core:
                continue
            track_p = f["steps"]["steps"][0]
            stage0 = f["steps"]["steps"][1]
            allowed = {
                (round(track_p["low"]), round(track_p["high"])),
                (round(stage0["low"]), round(stage0["high"])),
                (round(f["minimum_low"]), round(f["minimum_high"])),
                (round(f["full_low"]), round(f["full_high"])),
                (round(f["depth_low"]), round(f["depth_high"])),
            }
            if got in allowed:
                continue
            findings.append(
                f"{rel}: quotes {match.group(0)!r}, which is neither the arm range "
                f"({expected_core[0]}-{expected_core[1]}) nor a step's own hours - a total that "
                f"was typed rather than generated drifts first"
            )
    return findings


def check_learner_vocabulary(f):
    """The front page uses one name for a step. The other names stay in the internal docs."""
    findings = []
    text = read(README)
    forbidden = [
        (r"\bTier\s+\d", "Tier N"),
        (r"\bPass\s+\d", "Pass N"),
        (r"\bGate\b", "Gate"),
        (r"\bTrack P\b", "Track P"),
        (r"\bStage 0\b", "Stage 0"),
        (r"\bladder\b", "ladder"),
    ]
    for pattern, name in forbidden:
        if re.search(pattern, text):
            findings.append(
                f"README.md uses {name!r}; a learner sees Steps 1-10 only - keep that word in "
                f"docs/ROUTE.md or the folder indexes"
            )
    steps = re.findall(r"^\| \*\*\[(\d+) · ", text, re.M)
    if steps != [str(n) for n in range(1, 11)]:
        findings.append(
            f"README.md step table must list 1..10 once each in order, got {steps}; a missing or "
            f"repeated step makes the route look shorter than it is"
        )
    if "<!-- route:lessons -->" not in text:
        findings.append("README.md lost its generated lesson-count marker")
    return findings


def check_readme_table(f):
    findings = []
    text = read(README)
    for step in f["steps"]["steps"]:
        prefix = f"| **[{step['number']} · {step['title']}]("
        row = next((line for line in text.splitlines() if line.startswith(prefix)), None)
        if row is None:
            findings.append(
                f"README.md has no row for Step {step['number']} ({step['title']!r}); "
                f"run scripts/generate_readme_counts.py"
            )
            continue
        if f"| {step['lesson_count']} |" not in row:
            findings.append(
                f"README.md Step {step['number']} lesson count is not {step['lesson_count']}; "
                f"run scripts/generate_readme_counts.py"
            )
    if route.fmt(f["core_low"], f["core_high"]) in text:
        findings.append(
            "README.md uses the decimal route total instead of the rounded plan figure; "
            "run scripts/generate_sim_route.py"
        )
    return findings


def check_start_here(f):
    """README and the workbench read one JSON file; prove the README was generated from it.

    The block used to be typed twice - README.md and app/src/startHere.ts - with a checker that
    compared the copies, which only ever finds a drift after it has been published. Now
    `app/src/data/startHere.json` is the only copy of the words, the app imports it directly, and
    this check fails when README.md stops equalling what the generator renders from that file.
    """
    findings = []
    text = read(README)
    try:
        if start_here.rewrite(text) != text:
            findings.append(
                "README.md Start here block is stale; run scripts/generate_start_here.py"
            )
        payload = start_here.data()
        path = start_here.lesson_path(payload["lessonId"])
    except ValueError as error:
        findings.append(str(error))
        return findings

    try:
        app = read(APP_START_HERE)
        data = read(APP_LESSON_DATA)
    except OSError as error:
        findings.append(f"cannot read the workbench's Start here block: {error}")
        return findings

    if "./data/startHere.json" not in app:
        findings.append(
            "app/src/startHere.ts must import app/src/data/startHere.json; a typed copy is the "
            "drift this check exists to prevent"
        )
    if payload["heading"] in app or payload["note"] in app:
        findings.append(
            "app/src/startHere.ts repeats the Start here text instead of reading it from "
            "app/src/data/startHere.json"
        )
    if path != route_model.STEPS[0]["start"]:
        findings.append(
            f"startHere.json names lesson {payload['lessonId']!r} at {path!r}, but Step 1 starts "
            f"at {route_model.STEPS[0]['start']!r}; one of the two is a dead end"
        )
    p1 = re.search(r'"id": "P\.1",.*?"path": "([^"]+)"', data, re.S)
    app_path = p1.group(1) if p1 else ""
    if app_path != path:
        findings.append(
            f"the workbench's Lesson 1 is {app_path!r} while startHere.json resolves to "
            f"{path!r}; regenerate app/src/data/pythonLessonsData.ts or fix the lesson id"
        )
    if "blob/main/${START_HERE_LESSON_PATH}" not in app:
        findings.append(
            "app/src/startHere.ts must build its Lesson 1 URL from START_HERE_LESSON_PATH; a typed "
            "URL drifts the moment the page moves"
        )
    return findings


def check_generated_docs(f):
    findings = []
    expected = route.render()
    try:
        doc = read(route.OUT)
    except OSError:
        doc = ""
    if doc != expected:
        findings.append("docs/SIM_ROUTE.md is stale; run scripts/generate_sim_route.py")
    depth_expected = route.render_depth()
    try:
        depth_doc = read(route.DEPTH_OUT)
    except OSError:
        depth_doc = ""
    if depth_doc != depth_expected:
        findings.append("docs/DEPTH.md is stale; run scripts/generate_sim_route.py")
    minimum_expected = route.render_minimum()
    try:
        minimum_doc = read(route.MINIMUM_OUT)
    except OSError:
        minimum_doc = ""
    if minimum_doc != minimum_expected:
        findings.append("docs/MINIMUM.md is stale; run scripts/generate_sim_route.py")
    if route.render_readme(read(README)) != read(README):
        findings.append("README.md route figures are stale; run scripts/generate_sim_route.py")
    return findings


def run():
    f = facts()
    findings = []
    findings += check_step_model(f)
    findings += check_quoted_counts(f)
    findings += check_quoted_hours(f)
    findings += check_learner_vocabulary(f)
    findings += check_readme_table(f)
    findings += check_start_here(f)
    findings += check_generated_docs(f)
    return f, findings


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="print findings as JSON on stdout")
    args = parser.parse_args(argv)
    f, findings = run()
    if args.json:
        print(json.dumps({"facts": f, "findings": findings}, indent=2, ensure_ascii=False))
    elif findings:
        print(f"{len(findings)} contradiction(s):")
        for finding in findings:
            print(f"  - {finding}")
    else:
        print(
            f"consistent: {f['steps']['step_count']} steps, {f['lessons']} lessons, "
            f"{f['required_modules']} core + {f['optional_modules']} optional modules, "
            f"{f['core_low']:g}-{f['core_high']:g} hours"
        )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
