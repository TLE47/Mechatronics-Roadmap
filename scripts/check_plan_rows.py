#!/usr/bin/env python3
"""The gap page's verdicts, checked as a contract (`scripts/check_plan_rows.py`).

`docs/PLAN-2.0-GAP.md` is the page that says what the 2.0 plan asked for and what the app does now.
Once every row reads **ships**, that page stops being a wish list and becomes a claim: every row was
built, and a reader can run the thing that proves it. Two failures are then worth failing a build over.

**A reopened row.** The plan is closed; a new `partial` or `missing` is either unfinished work nobody
committed to, or a word that costs the page the only thing it has to sell. Run 200 fixed two verdicts
that had gone stale in exactly the other direction — rows kept `partial` after the work landed — so the
ratchet runs both ways: an open row is a failure here, and so is a verdict outside the vocabulary.

**A claim without evidence.** A `ships` row has to name something a reader can run: an `npm run`
script that exists, a `scripts/…` or `tests/…` path on disk, a `browser step <id>` that really is a
step in one of the Playwright suites, or a `checks <id>` that really is a numbered step of
`scripts/e2e_runtime.mjs`. Otherwise "ships" is one person's memory, which is what the page existed to
replace.

**A number with nothing behind it.** The page quotes counts and sizes — how many gates, tabs, snapshot
pairs, reading pages, kilobytes of firmware — and Run 204 found eight of them stale because nothing
re-read them. A number that matters is therefore written with a marker after it, `36<!-- plan-fact:gates_total -->`,
and `docs/plan-facts.json` says which file or generated artifact owns it. The gate recomputes every fact
and fails on a disagreement, on a marker naming a fact nobody defined, and on a fact that is defined but
no longer quoted. The marker renders as nothing, so the page reads exactly as it did.

It does not run the suites: that is `check_all.py`'s job, and a page gate that took four minutes would
be skipped. It checks that the page's promises point at something real, that its numbers still hold,
and that nothing is quietly reopened.

Usage
    python3 scripts/check_plan_rows.py           # the plan, against this repository
    python3 scripts/check_plan_rows.py --json    # machine-readable, stdout only

Exit-code family: typed
    0  every row is closed, mirrored by a real command, and unique
    1  a finding (an open row, a dead command or step, a duplicate, a lost table)
    2  the plan could not be read, or a flag was wrong
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = os.path.join(ROOT, "docs", "PLAN-2.0-GAP.md")
PACKAGE = os.path.join(ROOT, "package.json")

VERDICTS = ("ships", "partial", "missing")
OPEN = ("partial", "missing")
# The page carries 19 rows today. A floor catches a table that was emptied or renamed out of parsing;
# it is not a target, and adding a row is always allowed.
MIN_ROWS = 15

NPM_RUN = re.compile(r"npm run ([\w.:-]+)")
FILE_RUN = re.compile(r"(?<![\w/])((?:scripts|tests)/[\w./-]+\.(?:py|mjs|js|ts|sh))")
BROWSER_STEP = re.compile(r"browser steps? ([\w.-]+)")
STEP_COMMENT = re.compile(r"^\s*//\s*([0-9]+[a-z]?(?:-[ivx]+)*(?:-[a-z])?)\.", re.M)
# `checks 15–16` in a row names a numbered step of the real-browser runtime suite, the same way a
# browser step names one of the Playwright suites. It is not a count: it is the check that pins the
# claim, and renumbering that suite must fail the page rather than quietly point at another check.
RUNTIME_CHECK = re.compile(r"checks? (\d+)(?:[–-](\d+))?")
RUNTIME_SUITE = "scripts/e2e_runtime.mjs"


def tables(text: str):
    """Every markdown table in the page, as `(header cells, [row cells])`, fences skipped."""
    in_fence = False
    header: list[str] | None = None
    rows: list[list[str]] = []
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence or not line.startswith("|"):
            if rows:
                yield header or [], rows
                header, rows = None, []
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if all(set(cell) <= set(":- ") and cell for cell in cells):
            continue  # the separator row
        if header is None:
            header = cells
            continue
        rows.append(cells)
    if rows:
        yield header or [], rows


def browser_steps(root: str) -> set[str]:
    """Every step id the browser suites number, e.g. `5d-ii` or `7g-i`."""
    found: set[str] = set()
    for path in glob.glob(os.path.join(root, "scripts", "e2e_*.mjs")):
        with open(path, encoding="utf-8") as handle:
            found.update(STEP_COMMENT.findall(handle.read()))
    return found


def runtime_checks(root: str) -> set[str]:
    """Every numbered step the runtime suite's comments carry, e.g. `15` or `21`."""
    path = os.path.join(root, RUNTIME_SUITE)
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as handle:
        return set(STEP_COMMENT.findall(handle.read()))


def evidence(
    row: str, scripts: set[str], root: str, steps: set[str], checks: set[str] | None = None
) -> tuple[list[str], list[str]]:
    """`(problems, citations)` for one row: what it cites, and what it cites that is missing."""
    problems = []
    citations = []
    for name in NPM_RUN.findall(row):
        citations.append(f"npm run {name}")
        if name not in scripts:
            problems.append(f"`npm run {name}` is not a script in package.json")
    for path in FILE_RUN.findall(row):
        citations.append(path)
        if not os.path.exists(os.path.join(root, path)):
            problems.append(f"`{path}` is not on disk")
    for step in BROWSER_STEP.findall(row):
        citations.append(f"browser step {step}")
        if step not in steps:
            problems.append(f"`browser step {step}` is not a step in any scripts/e2e_*.mjs")
    if checks is not None:
        for first, last in RUNTIME_CHECK.findall(row):
            for number in (first, last) if last else (first,):
                citations.append(f"runtime check {number}")
                if number not in checks:
                    problems.append(f"`checks {number}` does not exist in {RUNTIME_SUITE}")
    return problems, citations


def plain(cell: str) -> str:
    """A cell's text without Markdown emphasis, so `**ships**` and `ships` read the same."""
    return re.sub(r"[*_`]", "", cell).strip()


FACTS = os.path.join(ROOT, "docs", "plan-facts.json")
FACT_MARKER = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*<!--\s*plan-fact:([a-z0-9_]+)\s*-->")


def _dig(data, pointer: str):
    """Walk a dotted pointer (`measured.total`) through loaded JSON."""
    node = data
    for part in pointer.split(".") if pointer else []:
        if not isinstance(node, dict) or part not in node:
            raise ValueError(f"no {pointer!r} in the JSON it names (missing {part!r})")
        node = node[part]
    return node


def _paths(fact: dict, root: str) -> list[str]:
    patterns = fact.get("globs") or [fact["glob"]]
    found: list[str] = []
    for pattern in patterns:
        found.extend(glob.glob(os.path.join(root, pattern)))
    return found


def fact_value(fact: dict, root: str):
    """The number a fact names, recomputed from the file or artifact that owns it."""
    kind = fact.get("kind")
    if kind == "check_all_gates":
        # `scripts/check_all.py` is the list itself; the page may quote all of it or the fast subset.
        scripts = os.path.dirname(os.path.abspath(__file__))
        if scripts not in sys.path:
            sys.path.insert(0, scripts)
        import check_all  # noqa: PLC0415 - imported here so the rest of the gate costs nothing

        return sum(1 for gate in check_all.GATES if not (fact.get("fast") and gate[2]))
    if kind == "json_count":
        with open(os.path.join(root, fact["path"]), encoding="utf-8") as handle:
            node = _dig(json.load(handle), fact.get("pointer", ""))
        items = list(node.values()) if isinstance(node, dict) else list(node)
        prefix = fact.get("path_prefix")
        if prefix:
            keep = fact.get("prefix_keeps", True)
            items = [item for item in items if str(item.get("path", "")).startswith(prefix) == keep]
        return len(items)
    if kind == "regex_count":
        with open(os.path.join(root, fact["path"]), encoding="utf-8") as handle:
            text = handle.read()
        return len(re.findall(fact["pattern"], text, re.M if "m" in fact.get("flags", "") else 0))
    if kind == "glob_count":
        return len(_paths(fact, root))
    if kind == "glob_kb":
        return round(sum(os.path.getsize(path) for path in _paths(fact, root)) / 1000)
    if kind == "json_mb":
        with open(os.path.join(root, fact["path"]), encoding="utf-8") as handle:
            return round(_dig(json.load(handle), fact["pointer"]) / 1_000_000, 2)
    raise ValueError(f"unknown fact kind {kind!r}")


def fact_findings(text: str, root: str = ROOT) -> list[dict]:
    """Every marked number against the fact it names, and every fact against the page.

    A missing facts file means there is nothing to check (the suite writes small plans in temporary
trees), so the repository's own `docs/plan-facts.json` is what turns this on.
    """
    path = os.path.join(root, os.path.relpath(FACTS, ROOT))
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as handle:
        defined = json.load(handle).get("facts", {})

    findings = []
    quoted: set[str] = set()
    for raw, fact_id in FACT_MARKER.findall(text):
        if fact_id not in defined:
            findings.append(
                {
                    "row": f"fact {fact_id}",
                    "why": f"{raw} is marked as `{fact_id}`, but docs/plan-facts.json defines no such fact",
                }
            )
            continue
        quoted.add(fact_id)
        try:
            expected = fact_value(defined[fact_id], root)
        except (OSError, ValueError, KeyError) as error:
            findings.append({"row": f"fact {fact_id}", "why": f"the fact could not be measured: {error}"})
            continue
        given = float(raw.replace(",", ""))
        if abs(given - expected) > 1e-9:
            findings.append(
                {
                    "row": f"fact {fact_id}",
                    "why": f"the page says {raw}; {defined[fact_id].get('what', fact_id)!s}: {expected:g}",
                }
            )
    for fact_id in defined:
        if fact_id not in quoted:
            findings.append(
                {
                    "row": f"fact {fact_id}",
                    "why": "defined in docs/plan-facts.json but no longer quoted on the page; drop the fact "
                    "or write its number with its marker",
                }
            )
    return findings


def check(text: str, root: str = ROOT, minimum: int = MIN_ROWS) -> tuple[list[dict], int]:
    """Every finding, and how many plan rows were read.

    `minimum` is the row floor, and a parameter so the suite can read a two-row plan without the
    repository's own size leaking into the test: the floor is about this page, not about the rules.
    """
    with open(os.path.join(root, "package.json"), encoding="utf-8") as handle:
        scripts = set(json.load(handle).get("scripts", {}))
    steps = browser_steps(root)
    checks = runtime_checks(root)

    findings = []
    read = 0
    seen: dict[str, int] = {}
    verdict_tables = 0
    for header, rows in tables(text):
        lower = [cell.lower() for cell in header]
        if "verdict" not in lower:
            continue
        verdict_tables += 1
        verdict_at = lower.index("verdict")
        item_at = 0
        for row in rows:
            if len(row) <= verdict_at:
                findings.append(
                    {
                        "row": row[0][:60],
                        "why": f"row has {len(row)} cell(s), so its verdict column is missing",
                    }
                )
                continue
            read += 1
            item = plain(row[item_at])
            verdict = plain(row[verdict_at]).lower()
            if verdict not in VERDICTS:
                findings.append(
                    {
                        "row": item,
                        "why": f"verdict {verdict!r} is not one of {', '.join(VERDICTS)}",
                    }
                )
                continue
            if verdict in OPEN:
                findings.append(
                    {
                        "row": item,
                        "why": f"the plan is closed, so a `{verdict}` row reopens it; finish it, or say in "
                        "the row why it is out of scope and call that `ships`",
                    }
                )
            if item in seen:
                findings.append(
                    {
                        "row": item,
                        "why": "a second row with the same plan item; two verdicts for one item is a "
                        "contradiction a reader cannot resolve",
                    }
                )
            seen[item] = seen.get(item, 0) + 1
            problems, citations = evidence(" ".join(row), scripts, root, steps, checks)
            findings.extend({"row": item, "why": problem} for problem in problems)
            if not citations:
                findings.append(
                    {
                        "row": item,
                        "why": "a `ships` row must cite a command or a browser step a reader can run; "
                        "otherwise the verdict is a memory, not a claim",
                    }
                )
    findings.extend(fact_findings(text, root))
    if verdict_tables == 0:
        findings.append({"row": "(none)", "why": "no table with a Verdict column in the plan"})
    elif read < minimum:
        # Only worth saying when a table was found: a page with none has already failed above, and two
        # findings for one cause is how a gate teaches people to read only the first line.
        findings.append(
            {
                "row": "(none)",
                "why": f"read {read} plan row(s), under the floor of {minimum}; a table that stopped "
                "parsing would read as a plan with nothing left to check",
            }
        )
    return findings, read


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Every row of the 2.0 gap page is closed and backed by something runnable.",
    )
    parser.add_argument("--json", action="store_true", help="machine-readable report on stdout")
    parser.add_argument("--root", default=ROOT, help="the repository to scan (default: this one)")
    args = parser.parse_args(argv)

    plan = os.path.join(args.root, os.path.relpath(PLAN, ROOT))
    try:
        with open(plan, encoding="utf-8") as handle:
            text = handle.read()
    except OSError as error:
        print(f"[FAIL] {error}", file=sys.stderr)
        return 2

    try:
        findings, read = check(text, args.root)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[FAIL] {error}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({"rows": read, "findings": findings}, indent=2))
    else:
        for finding in findings:
            print(f"{finding['row']}: {finding['why']}")
        if findings:
            print(
                f"\n[FAIL] {len(findings)} finding(s) in {read} plan row(s). The page is the contract: "
                "a verdict must be closed and a `ships` row must point at something runnable.",
                file=sys.stderr,
            )
        else:
            facts = len({fact_id for _, fact_id in FACT_MARKER.findall(text)})
            print(
                f"[PASS] Plan: {read} rows, every one closed and backed by a real command or browser "
                f"step; {facts} number(s) match docs/plan-facts.json."
            )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
