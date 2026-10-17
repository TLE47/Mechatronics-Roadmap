#!/usr/bin/env python3
"""Exercise coverage gate (`scripts/check_exercise_coverage.py`)

Every bridge module ships a graded exercise package under `exercises/<module id>/` - a starter
with holes, a reference solution, a behaviour suite, a transfer suite, planted faults that each
fail a named test, a browser self-check and a manifest. `scripts/run_exercise.py` proves a package
*works*; this gate proves one *exists*.

It is a wall, not a ratchet: there is no baseline and no allow-list. A bridge module with no
package fails the build, and so does a package missing any required file, a manifest that is not
valid JSON or does not carry the module's own id, and a package that plants no fault. Adding a
module without its exercise is therefore a red build, not a silent gap.

It also holds the page to its suite. When a behaviour suite checks that bad input raises
(`with self.assertRaises(ValueError):`), the module's `## 5. Exercise` section - everything above
`### Full Solution`, so the answer cannot be the only place it is said - must state at least one
refusal in prose (`refuses`, `raise`). Three dogfood rounds found the same defect: a suite testing
a contract the hint ladder never mentioned, leaving a correct formula that still fails. This gate
is a floor, not a proof - it cannot check that every guard is named; the dogfood rows are that
proof - but it makes total silence a red build.

Usage:
    python3 scripts/check_exercise_coverage.py             # check (default)
    python3 scripts/check_exercise_coverage.py --json
    python3 scripts/check_exercise_coverage.py --dry-run   # report, exit 0 either way

Exit-code family: typed (0 pass, 1 findings, 2 usage).
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULES_DIR = os.path.join(ROOT, "modules")
EXERCISES_DIR = os.path.join(ROOT, "exercises")

MODULE_ID = re.compile(r"^[0-9]{2}-[a-z]+\.T[1-3]\.[0-9]{2}[a-z]?$")
REQUIRED_FILES = (
    "exercise.json",
    "starter.py",
    "solution.py",
    "test_behavior.py",
    "test_transfer.py",
    "selfcheck.py",
    "harness.py",
)
MIN_FAULTS = 1

# `## 5. Exercise` up to (not including) `### Full Solution`: the page's teaching, not its answer.
EXERCISE_SECTION = re.compile(
    r"^##\s*5\.\s*Exercise\b(.*?)(?=^###\s*Full Solution)", re.MULTILINE | re.DOTALL
)
REFUSAL_CUE = re.compile(r"refus\w*|\braise[sd]?\b|\braising\b", re.IGNORECASE)
SUITE_REFUSAL = "assertRaises(ValueError)"


def module_ids():
    """The bridge modules, read from their filenames - the id is the file's stem."""
    ids = []
    for name in sorted(os.listdir(MODULES_DIR)):
        if not name.endswith(".md"):
            continue
        stem = name[:-3]
        if MODULE_ID.match(stem):
            ids.append(stem)
    return ids


def package_problems(module):
    """What is missing from `exercises/<module>/`, or an empty list when the package is complete."""
    directory = os.path.join(EXERCISES_DIR, module)
    if not os.path.isdir(directory):
        return None  # no package at all
    problems = []
    for name in REQUIRED_FILES:
        if not os.path.exists(os.path.join(directory, name)):
            problems.append("missing %s" % name)
    manifest_path = os.path.join(directory, "exercise.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
        except ValueError as error:
            problems.append("exercise.json is not valid JSON: %s" % error)
        else:
            if manifest.get("id") != module:
                problems.append("exercise.json id is %r, not the module id" % manifest.get("id"))
            for key in ("checks", "faults", "cheat", "delivery"):
                if key not in manifest:
                    problems.append("exercise.json has no %r section" % key)
            if len(manifest.get("faults") or {}) < MIN_FAULTS:
                problems.append("exercise.json declares no planted fault")
    faults = os.path.join(directory, "faults")
    if os.path.isdir(faults):
        planted = [n for n in os.listdir(faults) if n.endswith(".py") and not n.startswith("_")]
        if len(planted) < MIN_FAULTS:
            problems.append("faults/ holds no planted fault")
    return problems


def suite_refuses_input(module):
    """Whether the behaviour suite checks that bad input raises `ValueError`."""
    path = os.path.join(EXERCISES_DIR, module, "test_behavior.py")
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as handle:
        return SUITE_REFUSAL in handle.read()


def page_states_refusals(module):
    """Whether the exercise section, above the solution block, says something is refused or raises."""
    path = os.path.join(MODULES_DIR, module + ".md")
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as handle:
        text = handle.read()
    match = EXERCISE_SECTION.search(text)
    return bool(match and REFUSAL_CUE.search(match.group(1)))


def scan():
    ids = module_ids()
    missing, incomplete, graded, unstated = [], {}, [], []
    for module in ids:
        problems = package_problems(module)
        if problems is None:
            missing.append(module)
        elif problems:
            incomplete[module] = problems
        else:
            graded.append(module)
            if suite_refuses_input(module) and not page_states_refusals(module):
                unstated.append(module)
    return ids, missing, incomplete, graded, unstated


def check():
    ids, missing, incomplete, graded, unstated = scan()
    findings = []
    findings += ["%s ships no graded exercise package" % m for m in missing]
    findings += ["incomplete package %s: %s" % (m, "; ".join(p))
                 for m, p in sorted(incomplete.items())]
    findings += ["%s: the behaviour suite refuses bad input, but `## 5. Exercise` never says "
                 "what raises - state the refusals above `### Full Solution`" % m for m in unstated]
    return {
        "modules": len(ids),
        "graded": len(graded),
        "missing": len(missing),
        "incomplete": len(incomplete),
        "unstated": len(unstated),
        "findings": findings,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Fail when a bridge module ships no complete graded exercise.",
        epilog="Exit-code family: typed",
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="print what the gate would report, but exit 0")
    parser.add_argument("--json", action="store_true", help="print the result as JSON")
    parser.add_argument("-q", "--quiet", action="store_true", help="only report findings")
    args = parser.parse_args(argv)

    result = check()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if not args.quiet:
            print("Exercise coverage: %d/%d bridge modules graded (%d missing, %d incomplete)"
                  % (result["graded"], result["modules"], result["missing"], result["incomplete"]))
        if result["findings"]:
            print("%s: %d finding(s):" % ("would fail" if args.dry_run else "FAIL",
                                          len(result["findings"])), file=sys.stderr)
            for finding in result["findings"]:
                print("  - %s" % finding, file=sys.stderr)
    if args.dry_run:
        return 0
    return 1 if result["findings"] else 0


if __name__ == "__main__":
    sys.exit(main())
