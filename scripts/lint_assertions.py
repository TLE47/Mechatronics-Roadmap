#!/usr/bin/env python3
"""Lint behavioural assertion messages, with a ratchet so the debt only goes down.

Why a message matters: on the Core route a learner studies alone, and the failing assertion is the
only mentor in the room. `assertAlmostEqual(actual, 3.5, delta=1e-12)` says "3.5" and nothing else;
a learner cannot tell whether they broke the formula, the units, the sign or the boundary. A useful
message says what was expected, what arrived, the likely cause, and what to check — in one line, in
the second person, next to the code that knows.

The bar this script enforces for every graded assertion (`assertEqual`, `assertAlmostEqual`,
`assertTrue`, ... in `exercises/*/test_behavior.py`, `test_transfer.py` and `selfcheck.py`):

1. it carries a message, positionally or as `msg=`;
2. the message is a literal string of at least 40 characters;
3. it contains one of **check**, **likely** or **expected**.

`assertRaises` / `assertWarns` / `assertLogs` are exempt: their "message" is the exception, and the
test name already says what is being refused.

Two modes, because 1987 assertions start out below the bar:

- `--check` (default, and what CI runs) compares the tree against `docs/assertion-baseline.json` and
  fails on **any** file above its recorded count, on a file that is not recorded at all, and on a
  baseline that is above the tree — a ratchet that cannot silently loosen.
- `--write-baseline` rewrites the baseline from the tree, for use after a burn-down commit.

Exit codes: `0` ok, `1` findings, `2` wrong command line.
Exit-code family: typed.
"""

from __future__ import annotations

import argparse
import ast
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "docs", "assertion-baseline.json")

MESSAGE_MIN_CHARS = 40
KEYWORDS = ("check", "likely", "expected")

# How many positional arguments a call needs before its message can be present. Keyword `msg=` always
# counts. assertRaises/assertWarns/assertLogs are deliberately absent: nothing to lint.
MESSAGE_POSITION = {
    "assertTrue": 2,
    "assertFalse": 2,
    "assertIsNone": 2,
    "assertIsNotNone": 2,
    "assertEqual": 3,
    "assertNotEqual": 3,
    "assertIn": 3,
    "assertNotIn": 3,
    "assertGreater": 3,
    "assertGreaterEqual": 3,
    "assertLess": 3,
    "assertLessEqual": 3,
    "assertIs": 3,
    "assertIsNot": 3,
    "assertAlmostEqual": 4,
    "assertNotAlmostEqual": 4,
}
EXEMPT = {"assertRaises", "assertRaisesRegex", "assertWarns", "assertWarnsRegex", "assertLogs", "assertDictEqual"}


def graded_files():
    patterns = [
        os.path.join(ROOT, "exercises", "*", "test_behavior.py"),
        os.path.join(ROOT, "exercises", "*", "test_transfer.py"),
        os.path.join(ROOT, "exercises", "*", "selfcheck.py"),
    ]
    files = []
    for pattern in patterns:
        files.extend(glob.glob(pattern))
    return sorted(files)


def message_of(call):
    """The message argument's source text, or None. Returns "" when the call has no message at all."""
    for keyword in call.keywords:
        if keyword.arg == "msg":
            return keyword.value.value if isinstance(keyword.value, ast.Constant) else "<non-literal>"
    needed = MESSAGE_POSITION[call.func.attr]
    if len(call.args) < needed:
        return ""
    last = call.args[-1]
    if isinstance(last, ast.Constant) and isinstance(last.value, str):
        return last.value
    return "<non-literal>"


def problems_in(source, where="<source>"):
    """Every weak assertion in one file's source, as `where:line: reason` strings."""
    tree = ast.parse(source, filename=where)
    findings = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        name = node.func.attr
        if name in EXEMPT or name not in MESSAGE_POSITION:
            continue
        message = message_of(node)
        line = getattr(node, "lineno", 0)
        if message is None:
            findings.append(f"{where}:{line}: `{name}` carries an `msg=` that is not a literal string")
            continue
        if not message:
            findings.append(
                f"{where}:{line}: `{name}` has no message — say what was expected, what arrived, likely cause, what to check"
            )
            continue
        if message == "<non-literal>":
            findings.append(f"{where}:{line}: `{name}` message is not a literal string")
            continue
        if len(message) < MESSAGE_MIN_CHARS:
            findings.append(
                f"{where}:{line}: `{name}` message is {len(message)} chars, under {MESSAGE_MIN_CHARS}: {message!r}"
            )
            continue
        if not any(word in message.lower() for word in KEYWORDS):
            findings.append(
                f"{where}:{line}: `{name}` message names no check/likely/expected: {message!r}"
            )
    return findings


def scan():
    """`{relative path: [findings]}` for every graded file."""
    results = {}
    for path in graded_files():
        rel = os.path.relpath(path, ROOT)
        with open(path, "r", encoding="utf-8") as handle:
            try:
                results[rel] = problems_in(handle.read(), rel)
            except SyntaxError as exc:
                results[rel] = [f"{rel}: cannot parse: {exc}"]
    return results


def counts(results):
    return {rel: len(findings) for rel, findings in results.items() if findings}


def load_baseline(path=BASELINE):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def baseline_findings(results, baseline):
    """Ratchet: never above the recorded count, never a new file, and the total may only fall."""
    current = counts(results)
    allowed = baseline.get("files", {})
    problems = []
    for rel, count in sorted(current.items()):
        if rel not in allowed:
            problems.append(f"{rel}: {count} weak assertion(s) and no baseline entry — this file is not allowed to start")
        elif count > allowed[rel]:
            problems.append(f"{rel}: {count} weak assertion(s), baseline allows {allowed[rel]}")
        elif count < allowed[rel]:
            problems.append(
                f"{rel}: {count} weak assertion(s) but baseline still records {allowed[rel]} — lower it with --write-baseline"
            )
    for rel in sorted(set(allowed) - set(current)):
        if allowed[rel]:
            problems.append(f"{rel}: baseline records {allowed[rel]} weak assertion(s) but the file is gone or clean")
    total = sum(current.values())
    if total != baseline.get("total"):
        problems.append(f"total weak assertions {total}, baseline records {baseline.get('total')}")
    return problems


def write_baseline(results, path=BASELINE):
    payload = {
        "comment": "Ratchet for scripts/lint_assertions.py: per-file weak-assertion counts may only fall. Regenerate with --write-baseline after a burn-down.",
        "message_min_chars": MESSAGE_MIN_CHARS,
        "keywords": list(KEYWORDS),
        "total": sum(counts(results).values()),
        "files": dict(sorted(counts(results).items())),
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    return payload["total"]


def main(argv=None):
    parser = argparse.ArgumentParser(description="Lint behavioural assertion messages against a ratchet baseline")
    parser.add_argument("--check", action="store_true", help="compare against docs/assertion-baseline.json (default)")
    parser.add_argument("--write-baseline", action="store_true", help="record the current tree as the new floor")
    parser.add_argument("--json", action="store_true", help="print machine-readable findings")
    parser.add_argument("--quiet", action="store_true", help="print only the summary line")
    args = parser.parse_args(argv)

    results = scan()
    if args.write_baseline:
        total = write_baseline(results)
        print(f"wrote {os.path.relpath(BASELINE, ROOT)}: {total} weak assertions across {len(counts(results))} files")
        return 0

    problems = list(baseline_findings(results, load_baseline()))
    flat = [finding for findings in results.values() for finding in findings]
    if args.json:
        print(json.dumps({"findings": flat, "baseline_problems": problems, "total": len(flat)}, indent=2))
    elif problems:
        print("ASSERTION LINT FAILED:")
        for problem in problems:
            print("  -", problem)
    elif not args.quiet:
        for finding in flat:
            print("  -", finding)
    if not problems:
        print(f"OK: {len(flat)} weak assertions held at the baseline ({len(counts(results))} files)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
