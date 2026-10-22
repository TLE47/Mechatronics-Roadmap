#!/usr/bin/env python3
"""Run every gate CI's verification step runs, in that same order, from one command.

`.github/workflows/ci.yml` runs about thirty checks before a push is green, and a broken generated
file costs a full CI round trip to discover. Two of the last three pushes to this repository were
stopped by gates a contributor can run locally in seconds: the generated `concepts` crosswalk had
gone stale, and `check_term_order.py` counted a machine-written next-step line as taught material.

The gate list here is not a second opinion about what matters: it is the verify step's command list,
and `tests/test_check_all.py` parses that workflow and fails when the two drift apart in either
direction. Adding a check to CI therefore adds it here, and a gate cannot be quietly dropped.

The two sweeps are marked heavy - the 48-package exercise run (~10 s) and the 21-suite unittest
discovery (~32 s) - and are skipped unless `--full` is given, because the gates in front of them are
what catch drift.

Usage
    python3 scripts/check_all.py             # the drift gates, in CI order (~40 s)
    python3 scripts/check_all.py --full      # + exercise sweep and unittest discovery
    python3 scripts/check_all.py --list      # names, commands, which are heavy
    python3 scripts/check_all.py --only legacy_crosswalk --only term_order
    python3 scripts/check_all.py --json      # machine-readable, stdout only

Exit-code family: typed
    0  every gate that ran passed
    1  at least one gate failed
    2  the wrong interpreter, or a bad command line
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PINNED = open(os.path.join(ROOT, ".python-version"), encoding="utf-8").read().strip()

# (name, argv after the interpreter, heavy) - CI's verify step, in its order. `--verbose` stays
# where CI passes it, so a gate that only fails verbosely still shows its detail here.
GATES: list[tuple[str, list[str], bool]] = [
    # First, because a workflow file GitHub cannot parse never starts the job that runs the rest of
    # this list: the run fails in 0 s with no jobs, which is how a `: ` left unquoted in a step name
    # kept every push red.
    ("workflows", ["scripts/check_workflows.py"], False),
    ("verify_repo", ["scripts/verify_repo.py", "--verbose"], False),
    ("clean_tex", ["scripts/clean_tex.py", "--check"], False),
    ("modules", ["scripts/validate_modules.py"], False),
    ("lessons", ["scripts/lint_lessons.py"], False),
    ("ramp_lessons", ["scripts/check_ramp_lessons.py"], False),
    ("step_size", ["scripts/audit_step_size.py", "--check"], False),
    ("legacy_crosswalk", ["scripts/legacy_crosswalk.py", "--check"], False),
    ("mentions", ["scripts/mentions_audit.py", "--check"], False),
    ("lint_modules", ["scripts/lint_modules.py"], False),
    ("module_parity", ["scripts/module_parity.py", "--check"], False),
    ("ladder_gate", ["scripts/generate_ladder_gate.py", "--check"], False),
    ("skip_tests", ["scripts/generate_skip_tests.py", "--check"], False),
    ("plant_data", ["scripts/generate_plant_data.py", "--check"], False),
    ("term_order", ["scripts/check_term_order.py"], False),
    ("python_lessons_data", ["scripts/generate_python_lessons_data.py", "--check"], False),
    ("error_index", ["scripts/generate_error_index.py", "--check"], False),
    ("run_callouts", ["scripts/generate_run_callouts.py", "--check"], False),
    ("tab_names", ["scripts/check_tab_names.py"], False),
    ("link_history", ["scripts/generate_link_history_data.py", "--check"], False),
    ("sim_route", ["scripts/generate_sim_route.py", "--check"], False),
    ("spine_data", ["scripts/generate_spine_data.py", "--check"], False),
    ("next_links", ["scripts/generate_next_links.py", "--check"], False),
    ("step_docs", ["scripts/generate_step_docs.py", "--check"], False),
    ("readme_counts", ["scripts/generate_readme_counts.py", "--check"], False),
    ("consistency", ["scripts/check_consistency.py"], False),
    ("friction_report", ["scripts/friction_report.py", "--check"], False),
    ("assertions", ["scripts/lint_assertions.py"], False),
    # Heavy from here down: same commands CI runs, including the report handoff that lets the
    # unittest discovery reuse the sweep instead of running all 48 packages a second time.
    ("exercise_sweep", ["scripts/run_exercise.py", "--verbose"], True),
    ("exercise_coverage", ["scripts/check_exercise_coverage.py"], False),
    ("tests", ["-m", "unittest", "discover", "-s", "tests"], True),
]

REPORT_PATH = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "run-exercise.json")


def command_for(argv: list[str]) -> list[str]:
    """The full argv for a gate, with CI's report handoff added where CI adds it."""
    if argv[:1] == ["scripts/run_exercise.py"]:
        return [sys.executable, *argv, "--report-file", REPORT_PATH]
    return [sys.executable, *argv]


def environment_for(argv: list[str]) -> dict[str, str]:
    """CI hands the exercise report to the unittest discovery; reproduce that here."""
    env = dict(os.environ)
    if argv[:1] == ["-m"]:
        env["RUN_EXERCISE_REPORT"] = REPORT_PATH
    return env


def selected(only: list[str], full: bool) -> list[tuple[str, list[str], bool]]:
    gates = GATES if full else [gate for gate in GATES if not gate[2]]
    if not only:
        return gates
    wanted = {name.lower() for name in only}
    chosen = [gate for gate in gates if gate[0] in wanted or gate[1][0] in wanted]
    missing = wanted - {gate[0] for gate in chosen} - {gate[1][0] for gate in chosen}
    if missing:
        raise SystemExit(f"unknown gate(s): {', '.join(sorted(missing))} - see --list")
    return chosen


def run(gate: tuple[str, list[str], bool], quiet: bool) -> dict:
    name, argv, heavy = gate
    started = time.time()
    proc = subprocess.run(
        command_for(argv),
        cwd=ROOT,
        env=environment_for(argv),
        capture_output=True,
        text=True,
        timeout=1800 if heavy else 300,
    )
    record = {
        "name": name,
        "command": " ".join(argv),
        "heavy": heavy,
        "ok": proc.returncode == 0,
        "returncode": proc.returncode,
        "seconds": round(time.time() - started, 2),
    }
    if not quiet:
        print(f"[{'ok' if record['ok'] else 'FAIL'}] {name:<22} {record['seconds']:6.1f}s", flush=True)
    if not record["ok"]:
        detail = (proc.stdout or "") + (proc.stderr or "")
        tail = "\n".join(detail.strip().splitlines()[-25:])
        print(f"\n--- {name}: {proc.returncode} ---\n{tail}\n", file=sys.stderr, flush=True)
        record["detail"] = tail
    return record


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the gates CI's verification step runs, in CI's order.",
        epilog="Exit-code family: typed (0 pass, 1 a gate failed, 2 bad interpreter or arguments).",
    )
    parser.add_argument("--full", action="store_true", help="also run the exercise sweep and the unittest discovery")
    parser.add_argument("--only", action="append", metavar="GATE", help="run only this gate (repeatable)")
    parser.add_argument("--list", action="store_true", help="list the gates and exit")
    parser.add_argument("--json", action="store_true", help="print a JSON report on stdout")
    parser.add_argument("-q", "--quiet", action="store_true", help="print only the summary line")
    args = parser.parse_args()

    if sys.version_info[:2] != tuple(int(part) for part in PINNED.split(".")[:2]):
        print(
            f"this repository pins Python {PINNED} (.python-version); some gates need 3.10+ syntax, "
            f"so {sys.version.split()[0]} cannot stand in. Try: python{PINNED} scripts/check_all.py",
            file=sys.stderr,
        )
        return 2

    if args.list:
        for name, argv, heavy in GATES:
            print(f"{'heavy' if heavy else '     '}  {name:<22} python3 {' '.join(argv)}")
        return 0

    gates = selected(args.only, args.full)
    if not gates:
        print("no gates selected", file=sys.stderr)
        return 2

    if not args.json and not args.quiet:
        print(f"running {len(gates)} gate(s) from .github/workflows/ci.yml\n")
    started = time.time()
    records = [run(gate, args.quiet or args.json) for gate in gates]
    failed = [record for record in records if not record["ok"]]
    total = time.time() - started

    if args.json:
        print(json.dumps({"ok": not failed, "seconds": round(total, 1), "gates": records}, indent=2))
    else:
        print(f"\n{len(records)} gate(s): {len(records) - len(failed)} passed, {len(failed)} failed in {total:.1f}s")
        if failed:
            print("failed: " + ", ".join(record["name"] for record in failed), file=sys.stderr)
            print("fix the generated file with the gate's own command, or re-run with --only <gate>", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
