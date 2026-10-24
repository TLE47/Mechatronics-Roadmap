#!/usr/bin/env python3
"""One command that says whether the pilot kit still works (`scripts/check_pilot_kit.py`).

The kit is machinery an operator reaches for while a stranger is sitting at their laptop: the sitting
record, the export preflight, the transfer follow-up, the aggregate, and the instructions that tie them
together. Those pieces are covered by five separate gates in this repository, and a person about to run a
sitting should not have to remember five commands — or read a four-hundred-test matrix to learn that a
script the kit names has been renamed.

So this runs the kit's own eight gates and prints one line each. It is deliberately **not** part of
`check_all`: `check_all` already runs every one of them through its `tests` and `doc_commands` gates, and
this exists for the five seconds before a sitting, not to duplicate CI.

What it runs, and why each one is the kit's business:

| Gate | What it protects |
| :--- | :--- |
| `pilot_sitting.py`'s tests | The record of where a participant stopped, and the claims its export supports |
| `pilot_preflight.py`'s tests | The check that decides whether a participant's export can be logged |
| `pilot_followup.py`'s tests | The due date that keeps the transfer question from being forgotten |
| `friction_report.py`'s tests | The arithmetic the aggregate publishes |
| The committed aggregate is current | `docs/friction-report.md` matching what the script renders |
| `pilot_results.py`'s tests | The results page reading its count from the folders, not from an edit |
| The committed results are current | `docs/pilot-results.md` matching what the folders render |
| Every command in the docs exists | The kit page's own instructions still pointing at real scripts |

Every gate runs even when an earlier one fails: "the preflight is broken **and** a command in the kit no
longer exists" is one errand, not two.

Usage
    python3 scripts/check_pilot_kit.py              # one line per gate, a summary, exit 0 or 1
    python3 scripts/check_pilot_kit.py --verbose    # a failing gate's output, not just its name
    python3 scripts/check_pilot_kit.py --json       # machine-readable, stdout only
    python3 scripts/check_pilot_kit.py --only follow-up   # one gate by name or by a fragment of it

Exit-code family: typed
    0  every gate passed
    1  a gate failed: read the line and re-run it with --verbose
    2  the command line, or a gate this repository does not know
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYTHON = sys.executable or "python3"


def script(relative: str) -> str:
    return os.path.join(ROOT, relative)


# The kit, as a list of commands. `argv` is run in this repository's root, with this interpreter, so a
# gate sees the same Python the operator does.
GATES: list[tuple[str, list[str]]] = [
    ("sitting tests", [PYTHON, script("tests/test_pilot_sitting.py")]),
    ("preflight tests", [PYTHON, script("tests/test_pilot_preflight.py")]),
    ("follow-up tests", [PYTHON, script("tests/test_pilot_followup.py")]),
    ("aggregate tests", [PYTHON, script("tests/test_friction_report.py")]),
    ("aggregate is current", [PYTHON, script("scripts/friction_report.py"), "--check"]),
    ("results tests", [PYTHON, script("tests/test_pilot_results.py")]),
    ("results are current", [PYTHON, script("scripts/pilot_results.py"), "--check"]),
    ("docs name real commands", [PYTHON, script("scripts/check_doc_commands.py")]),
]


def run_gate(gate: tuple[str, list[str]]) -> dict:
    """Run one gate to completion and keep what it said, whatever it said."""
    name, argv = gate
    started = time.monotonic()
    try:
        completed = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True, timeout=600)
        ok = completed.returncode == 0
        output = (completed.stdout + completed.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as error:
        ok = False
        output = str(error)
    return {"name": name, "ok": ok, "seconds": round(time.monotonic() - started, 1), "output": output}


def run_gates(gates: list[tuple[str, list[str]]], verbose: bool = False) -> tuple[list[dict], int]:
    """Run every gate, printing as each one lands. Returns the results and the exit code."""
    results = []
    for gate in gates:
        result = run_gate(gate)
        results.append(result)
        tag = "ok  " if result["ok"] else "FAIL"
        print(f"[{tag}] {result['name']:<24} {result['seconds']:>5.1f}s")
        if not result["ok"]:
            # A failing gate's own words, unless --verbose asks for every gate's: the failure is the
            # thing the operator needs before a sitting, and a summary line does not say which test.
            body = result["output"] or "(no output)"
            tail = body.splitlines()[-24:] if not verbose else body.splitlines()
            for line in tail:
                print(f"       {line}")
            if not verbose and len(body.splitlines()) > len(tail):
                print(f"       … {len(body.splitlines()) - len(tail)} earlier line(s); re-run that gate directly")
    failed = [result for result in results if not result["ok"]]
    return results, 1 if failed else 0


def select(gates: list[tuple[str, list[str]]], wanted: str | None) -> list[tuple[str, list[str]]]:
    """The gates named by `--only`: an exact name, or a fragment unique enough to name one."""
    if not wanted:
        return gates
    exact = [gate for gate in gates if gate[0] == wanted]
    if exact:
        return exact
    partial = [gate for gate in gates if wanted.lower() in gate[0].lower()]
    return partial


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Run the pilot kit's own gates and print one line each.")
    parser.add_argument("--verbose", action="store_true", help="a failing gate's whole output")
    parser.add_argument("--json", action="store_true", help="machine-readable report on stdout")
    parser.add_argument(
        "--only",
        metavar="NAME",
        help="one gate, by name or by a fragment of it (e.g. follow-up, docs, aggregate)",
    )
    args = parser.parse_args(argv)

    gates = select(GATES, args.only)
    if not gates:
        print(
            f"[FAIL] no gate matches {args.only!r}; check the names in GATES",
            file=sys.stderr,
        )
        return 2

    if args.json:
        # The lines are for a person; the JSON is the same results without them.
        results = [run_gate(gate) for gate in gates]
        print(json.dumps({"gates": results, "ok": all(r["ok"] for r in results)}, indent=2))
        return 0 if all(result["ok"] for result in results) else 1

    started = time.monotonic()
    results, code = run_gates(gates, verbose=args.verbose)
    total = round(time.monotonic() - started, 1)
    passed = sum(1 for result in results if result["ok"])
    if code:
        print(
            f"\n{passed} of {len(results)} pilot gate(s) passed in {total}s — "
            "the kit is not safe to run a sitting with until the line above is fixed"
        )
    else:
        print(f"\n[PASS] {passed} pilot gate(s) in {total}s — the kit is ready for a sitting")
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
