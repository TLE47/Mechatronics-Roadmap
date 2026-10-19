#!/usr/bin/env python3
"""Lint behavioural assertion messages, with a ratchet so the debt only goes down.

Why a message matters: on the Core route a learner studies alone, and the failing assertion is the
only mentor in the room. `assertAlmostEqual(actual, 3.5, delta=1e-12)` says "3.5" and nothing else;
a learner cannot tell whether they broke the formula, the units, the sign or the boundary. A useful
message says what was expected, what arrived, the likely cause, and what to check — in one line, in
the second person, next to the code that knows.

The bar this script enforces for every graded assertion (`assertEqual`, `assertAlmostEqual`,
`assertTrue`, ... in `exercises/*/test_behavior.py`, `test_transfer.py`, `selfcheck.py` and the
repository's own `tests/*.py` suites):

1. it carries a message, positionally or as `msg=`;
2. the message is a literal string of at least 40 characters;
3. it contains one of **check**, **likely** or **expected**.

`assertRaises` / `assertWarns` / `assertLogs` are exempt: their "message" is the exception, and the
test name already says what is being refused.

Two modes. The exercise packages reached **zero** weak assertions on 2026-10-18; the `tests/`
suites were added to the same ratchet that day at their measured count of 368, so `--check` is a
floor over both trees: every graded assertion carries a diagnostic and no file may start with debt.

- `--check` (default, and what CI runs) compares the tree against `docs/assertion-baseline.json` and
  fails on **any** file above its recorded count, on a file that is not recorded at all, and on a
  baseline that is above the tree — a ratchet that cannot silently loosen. With the baseline at
  zero, the first two clauses mean a new graded file or a new bare assertion fails CI immediately.
- `--write-baseline` rewrites the baseline from the tree, for use after a burn-down commit.
- `--tracks` reports the same numbers grouped by track (`00-foundations`, `04-embedded`, ...),
  so the next round's packages can be chosen from the data instead of recomputed by hand. The
  baseline carries the same breakdown under `tracks`, refreshed by `--write-baseline`.
- `--plan [N]` prints the next N packages (default six) by weak-assertion count, both graded files
  each, as a ready-to-paste task line. It is the same data `--tracks` shows, ranked per package.

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
        # The repository's own 21 suites run in CI on every push, so a message-free assertion here
        # fails a learner no click away from the defect the suite exists to catch. Leaving them out
        # made the ratchet cover the graded packages and nothing that grades the packages.
        os.path.join(ROOT, "tests", "*.py"),
    ]
    files = []
    for pattern in patterns:
        files.extend(glob.glob(pattern))
    return sorted(files)


def literal_text(node):
    """A string-valued node flattened to text, or None when it is not a string literal.

    An f-string is literal enough to lint: its constant segments are what a reader sees, and each
    `{hole}` becomes `{}` so a message built as `f"{name} must be positive"` still gets its length
    and its keyword checked. Rejecting every f-string made the lint blind to the form most messages
    in `tests/` are written in, which is why those files were outside the ratchet at all.
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts = []
        for value in node.values:
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                parts.append(value.value)
            elif isinstance(value, ast.FormattedValue):
                parts.append("{}")
            else:
                return None
        return "".join(parts)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left = literal_text(node.left)
        right = literal_text(node.right)
        if left is None or right is None:
            return None
        return left + right
    return None


def message_of(call):
    """The message argument's source text, or None. Returns "" when the call has no message at all."""
    for keyword in call.keywords:
        if keyword.arg == "msg":
            text = literal_text(keyword.value)
            return "<non-literal>" if text is None else text
    needed = MESSAGE_POSITION[call.func.attr]
    if len(call.args) < needed:
        return ""
    last = call.args[-1]
    text = literal_text(last)
    return "<non-literal>" if text is None else text


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


def track_of(relative_path):
    """The track a graded file belongs to: `exercises/04-embedded.T1.04a/...` -> `04-embedded`."""
    parts = relative_path.replace(os.sep, "/").split("/")
    if len(parts) < 2:
        return "(ungrouped)"
    return parts[-2].split(".")[0] or "(ungrouped)"


def track_totals(results):
    """`{track: {"total": weak assertions, "files": files still above zero}}`, worst first."""
    grouped = {}
    for rel, count in counts(results).items():
        entry = grouped.setdefault(track_of(rel), {"total": 0, "files": 0})
        entry["total"] += count
        entry["files"] += 1
    return dict(sorted(grouped.items(), key=lambda item: (-item[1]["total"], item[0])))


PLAN_PACKAGES = 6


def package_of(relative_path):
    """`exercises/04-embedded.T1.04a/test_behavior.py` -> `04-embedded.T1.04a`."""
    parts = relative_path.replace(os.sep, "/").split("/")
    return parts[-2] if len(parts) >= 2 else "(ungrouped)"


def package_totals(results):
    """`[(package, weak), ...]` worst first, with packages that are already clean dropped."""
    grouped = {}
    for rel, count in counts(results).items():
        name = package_of(rel)
        grouped[name] = grouped.get(name, 0) + count
    return sorted(((name, count) for name, count in grouped.items() if count),
                  key=lambda item: (-item[1], item[0]))


def plan_text(results, limit=PLAN_PACKAGES):
    """The next round as a paste-ready task line plus the six package names and their sizes."""
    packages = package_totals(results)[:limit]
    total = sum(counts(results).values())
    if not packages:
        return ("Nothing left to burn down: 0 weak assertions in the tree. "
                "`--check` is the floor that keeps it there.")
    noun = "package" if len(packages) == 1 else "packages"
    lines = [f"Burn down the next {len(packages)} {noun}, both graded files each:"]
    for index, (name, weak) in enumerate(packages, 1):
        lines.append(f"  {index}. {name} ({weak} weak assertions)")
    lines.append(f"Round total: {sum(weak for _, weak in packages)} of {total} weak assertions.")
    return "\n".join(lines)


def write_baseline(results, path=BASELINE):
    payload = {
        "comment": "Ratchet for scripts/lint_assertions.py: per-file weak-assertion counts may only fall. Regenerate with --write-baseline after a burn-down.",
        "message_min_chars": MESSAGE_MIN_CHARS,
        "keywords": list(KEYWORDS),
        "total": sum(counts(results).values()),
        "files": dict(sorted(counts(results).items())),
        "tracks": track_totals(results),
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
    parser.add_argument("--tracks", action="store_true",
                        help="report weak assertions per track, worst first")
    parser.add_argument("--plan", nargs="?", type=int, const=PLAN_PACKAGES, metavar="N",
                        help="print the next N packages by weak-assertion count (default 6), "
                             "ready to paste into a task")
    parser.add_argument("--quiet", action="store_true", help="print only the summary line")
    args = parser.parse_args(argv)
    if args.plan is not None and args.plan < 1:
        parser.error("--plan needs a positive package count")

    results = scan()
    if args.plan is not None:
        packages = package_totals(results)[:args.plan]
        if args.json:
            print(json.dumps({"packages": [{"package": name, "weak": weak}
                                          for name, weak in packages],
                              "total": sum(counts(results).values())}, indent=2))
            return 0
        print(plan_text(results, args.plan))
        return 0
    if args.tracks:
        totals = track_totals(results)
        if args.json:
            print(json.dumps({"tracks": totals, "total": sum(t["total"] for t in totals.values())},
                             indent=2))
            return 0
        width = max([len(name) for name in totals] + [len("track")])
        print(f"{'track':<{width}}  {'weak':>5}  {'files':>5}")
        for name, entry in totals.items():
            print(f"{name:<{width}}  {entry['total']:>5}  {entry['files']:>5}")
        print(f"{'total':<{width}}  {sum(t['total'] for t in totals.values()):>5}  "
              f"{sum(t['files'] for t in totals.values()):>5}")
        return 0
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
        # stdout stays parseable JSON under --json; the human summary is a log line, so it goes to
        # stderr where a `... | jq` pipeline cannot see it.
        stream = sys.stderr if args.json else sys.stdout
        print(f"OK: {len(flat)} weak assertions held at the baseline ({len(counts(results))} files)",
              file=stream)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
