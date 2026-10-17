#!/usr/bin/env python3
"""Exercise coverage gate (`scripts/check_exercise_coverage.py`)

Every bridge module is supposed to ship a graded exercise package under
`exercises/<module id>/` - a starter with holes, a reference solution, a behaviour suite, a
transfer suite, planted faults that each fail a named test, a browser self-check and a manifest.
`scripts/run_exercise.py` proves a package *works*; nothing proved a package *exists*, so a new
module could ship with no graded exercise and every check would stay green.

This gate closes that hole with a ratchet, not a wall: `docs/exercise-baseline.json` records the
modules that are still ungraded, and

  * a module with no package that is **not** in the baseline fails the build (a new gap);
  * a package missing any of its required files fails the build (an incomplete gap);
  * a baseline entry that now **has** a package fails the build until it is removed, so the
    baseline can only shrink and the recorded number can never drift back up silently.

Usage:
    python3 scripts/check_exercise_coverage.py             # check (default)
    python3 scripts/check_exercise_coverage.py --update-baseline
    python3 scripts/check_exercise_coverage.py --json
    python3 scripts/check_exercise_coverage.py --dry-run --update-baseline

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
BASELINE = os.path.join(ROOT, "docs", "exercise-baseline.json")

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
            manifest = json.load(open(manifest_path))
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


def read_baseline():
    if not os.path.exists(BASELINE):
        return []
    data = json.load(open(BASELINE))
    entries = data.get("allowed_missing", [])
    if not isinstance(entries, list) or not all(isinstance(item, str) for item in entries):
        raise SystemExit("docs/exercise-baseline.json: allowed_missing must be a list of ids")
    return sorted(entries)


def write_baseline(missing):
    payload = {
        "note": "Bridge modules with no graded exercise yet. This list may only shrink; "
                "add a package, then run --update-baseline to remove the entry.",
        "allowed_missing": sorted(missing),
    }
    with open(BASELINE, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def scan():
    ids = module_ids()
    missing, incomplete, graded = [], {}, []
    for module in ids:
        problems = package_problems(module)
        if problems is None:
            missing.append(module)
        elif problems:
            incomplete[module] = problems
        else:
            graded.append(module)
    return ids, missing, incomplete, graded


def check():
    ids, missing, incomplete, graded = scan()
    allowed = read_baseline()
    unknown = [m for m in allowed if m not in ids]
    stale = [m for m in allowed if m in graded]
    new_gaps = [m for m in missing if m not in allowed]
    findings = []
    findings += ["new gap: %s ships no exercise package" % m for m in new_gaps]
    findings += ["incomplete package %s: %s" % (m, "; ".join(p)) for m, p in sorted(incomplete.items())]
    findings += ["stale baseline entry: %s now has a package - run --update-baseline" % m for m in stale]
    findings += ["baseline names a module that does not exist: %s" % m for m in unknown]
    return {
        "modules": len(ids),
        "graded": len(graded),
        "missing": len(missing),
        "incomplete": len(incomplete),
        "allowed": len(allowed),
        "findings": findings,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Fail when a bridge module ships no graded exercise, with a ratcheting baseline.",
        epilog="Exit-code family: typed",
    )
    parser.add_argument("--update-baseline", action="store_true",
                        help="rewrite docs/exercise-baseline.json from what is on disk")
    parser.add_argument("--dry-run", action="store_true",
                        help="with --update-baseline, print the change without writing")
    parser.add_argument("--json", action="store_true", help="print the result as JSON")
    parser.add_argument("-q", "--quiet", action="store_true", help="only report findings")
    args = parser.parse_args(argv)

    if args.update_baseline:
        _ids, missing, incomplete, _graded = scan()
        if incomplete:
            print("refusing to record an incomplete package as 'allowed missing':", file=sys.stderr)
            for module, problems in sorted(incomplete.items()):
                print("  %s: %s" % (module, "; ".join(problems)), file=sys.stderr)
            return 2
        if args.dry_run:
            print("would write %d entries to docs/exercise-baseline.json" % len(missing))
            return 0
        write_baseline(missing)
        if not args.quiet:
            print("wrote docs/exercise-baseline.json with %d allowed-missing entries" % len(missing))
        return 0

    result = check()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if not args.quiet:
            print("Exercise coverage: %d/%d bridge modules graded (%d allowed missing, %d incomplete)"
                  % (result["graded"], result["modules"], result["allowed"], result["incomplete"]))
        if result["findings"]:
            print("FAIL: %d finding(s):" % len(result["findings"]), file=sys.stderr)
            for finding in result["findings"]:
                print("  - %s" % finding, file=sys.stderr)
    return 1 if result["findings"] else 0


if __name__ == "__main__":
    sys.exit(main())
