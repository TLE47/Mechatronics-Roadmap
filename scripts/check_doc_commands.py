#!/usr/bin/env python3
"""Every command the docs tell a reader to run must exist (`scripts/check_doc_commands.py`).

This repository's instructions are commands: `docs/VERIFICATION.md` is a list of them, `CONTRIBUTING.md`
is the order to run them in, and `README.md` is the three that matter. Every one of those is a promise
to a reader, and a promise that names a script which no longer exists is worse than no instructions —
the reader concludes the repository is broken, or that they are.

The rot is quiet. A script gets renamed and its two callers are updated; the doc that mentioned it is not
run by anything, so nothing goes red. `tests/test_check_all.py` already pins the *gate list* against CI,
which catches a gate going missing from the workflow but not a `npm run` in a paragraph. This gate closes
that: every `npm run <script>` and every `scripts/…` / `tests/…` path in the instruction pages is looked
up in `package.json` and on disk.

What it deliberately does **not** read is history: `CHANGELOG.md`, `docs/dogfood-log.md` and
`docs/pilot-results.md` describe what was true on the day they were written, and a gate that rewrote
those would be asking the past to keep up.

Usage
    python3 scripts/check_doc_commands.py            # the instruction pages, and the workflow files
    python3 scripts/check_doc_commands.py --json     # machine-readable, stdout only
    python3 scripts/check_doc_commands.py --verbose  # every command found, not just the problems

Exit-code family: typed
    0  every command named in the docs exists
    1  a doc names an npm script or a file that is not there
    2  the scan could not run (no package.json, a bad flag)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The pages that instruct a reader. History (`CHANGELOG.md`, the pilot notes, the dogfood log) is not
# here on purpose: it records what was true then.
DOCS = [
    "README.md",
    "CONTRIBUTING.md",
    "app/README.md",
    "docs/README.md",
    "docs/VERIFICATION.md",
    "docs/PLAN-2.0-GAP.md",
    # The operator's run book: its commands are typed by a person with a participant waiting.
    "docs/PILOT_KIT.md",
]

# CI is instructions too, in the strongest form: a `npm run` there that names nothing fails a job
# minutes later on a runner, where this can say so in milliseconds.
WORKFLOWS = [".github/workflows/ci.yml", ".github/workflows/link-check.yml"]

# `npm run test:scope -- --record` and `npm run check:weight  --json`: the flags are the script's
# business, not this gate's. A trailing `:` with nothing after it (`npm run test:`) is a placeholder.
NPM_RUN = re.compile(r"npm run ([\w.:-]+)")
# `node --experimental-strip-types scripts/test_x.mjs`, `python3.12 scripts/check_all.py`.
FILE_RUN = re.compile(
    r"(?<![\w/])(?:node|python3(?:\.\d+)?)\s+(?:--experimental-strip-types\s+)?"
    r"((?:scripts|tests)/[\w./-]+\.(?:py|mjs|js|ts|sh))"
)


def script_names(package_json: str) -> set[str]:
    """The `scripts` block's keys."""
    data = json.loads(package_json)
    scripts = data.get("scripts")
    if not isinstance(scripts, dict):
        raise ValueError("package.json has no scripts block")
    return set(scripts)


def iter_commands(text: str):
    """Every command a page names, as `(kind, name, line)`. Shared by the gate and its tests."""
    for number, line in enumerate(text.splitlines(), start=1):
        for match in NPM_RUN.finditer(line):
            name = match.group(1)
            # `npm run test:` with nothing after the colon names a family, not a script; reading it as
            # the script `test` would invent a finding out of a sentence.
            if name.endswith(":"):
                continue
            yield "npm", name, number
        for match in FILE_RUN.finditer(line):
            yield "file", match.group(1), number


def problems_in(text: str, label: str, scripts: set[str], root: str = ROOT) -> list[dict]:
    """Everything in one page that a reader could not run, with the line that says it."""
    found = []
    for kind, name, line in iter_commands(text):
        if kind == "npm":
            if name not in scripts:
                found.append(
                    {
                        "file": label,
                        "line": line,
                        "kind": kind,
                        "name": name,
                        "why": f"npm run {name} does not exist in package.json",
                    }
                )
        else:
            if not os.path.exists(os.path.join(root, name)):
                found.append(
                    {
                        "file": label,
                        "line": line,
                        "kind": kind,
                        "name": name,
                        "why": f"{name} is not on disk",
                    }
                )
    return found


def scan(root: str = ROOT) -> tuple[list[dict], int]:
    """The whole sweep: every problem, and how many commands were checked."""
    package_json = os.path.join(root, "package.json")
    if not os.path.exists(package_json):
        raise FileNotFoundError(f"{package_json} is missing")
    with open(package_json, encoding="utf-8") as handle:
        scripts = script_names(handle.read())

    problems = []
    checked = 0
    for relative in DOCS + WORKFLOWS:
        path = os.path.join(root, relative)
        if not os.path.exists(path):
            # A page this list names but the repository does not have is itself a finding: either the
            # page moved (and the list should move with it) or it was deleted.
            problems.append(
                {"file": relative, "line": 0, "kind": "page", "name": relative, "why": "the page is missing"}
            )
            continue
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        checked += sum(1 for _ in iter_commands(text))
        problems.extend(problems_in(text, relative, scripts, root))
    return problems, checked


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Every npm script and file the instruction pages name must exist.",
    )
    parser.add_argument("--json", action="store_true", help="machine-readable report on stdout")
    parser.add_argument("--verbose", action="store_true", help="list every command, not only the problems")
    parser.add_argument("--root", default=ROOT, help="the repository to scan (default: this one)")
    args = parser.parse_args(argv)

    try:
        problems, checked = scan(args.root)
    except (FileNotFoundError, ValueError) as error:
        print(f"[FAIL] {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({"checked": checked, "problems": problems}, indent=2))
    else:
        for problem in problems:
            where = problem["file"] if problem["line"] == 0 else f"{problem['file']}:{problem['line']}"
            print(f"{where}: {problem['why']}")
        if problems:
            print(
                f"\n[FAIL] {len(problems)} command(s) a reader could not run. A doc that names a script "
                "which no longer exists is worse than no instructions.",
                file=sys.stderr,
            )
        else:
            print(f"[PASS] Docs: {checked} command(s) across {len(DOCS)} pages and {len(WORKFLOWS)} workflows, all real.")
            if args.verbose:
                print("  (every command parsed; none missing)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
