#!/usr/bin/env python3
"""
Automated Advanced-Module Teaching-Ladder Linter (`scripts/lint_modules.py`)

`scripts/lint_lessons.py` walks only the 48 beginner lessons, so the 44 bridge modules under
`modules/` - the Tier 1-3 files the beginner ladder feeds into - have never been checked against
any standard at all. This linter closes that hole and keeps the two halves apart:

1. **Gated - structural invariants** every module carries today (measured 44/44 on 2026-10-16):
   the YAML front-matter contract, the numbered `## 1. Why it matters` .. `## 10. Next modules`
   sequence with its exact titles, the `### Skip test` section, the `[Recall]` / `[Apply]` /
   `[Transfer]` question tags, and no `TODO-AUTHOR` scaffold marker left behind by
   `scripts/new_module.py`. A new module that drops one of these fails.
2. **Reported - the ladder stages some modules do not carry.** The unified 8-Step Teaching Ladder
   (`docs/SYLLABUS.md` section C: Recall -> See it -> Predict -> Work through -> Practice with
   support -> Break it on purpose -> Transfer -> Integrate) is only partly present in the bridge
   modules, and the coverage table prints exactly which stages are missing how many modules. It is
   deliberately NOT a gate: making 44 modules fail today would buy nothing, and the gap belongs in
   a curriculum review, not in a red build.

**Structure only.** This script proves a module *carries* the sections and tags. It cannot judge
whether the recall question is well chosen, the prediction is quantitative, or the planted fault
is diagnosable - that is the human review the coverage table is there to start.

Usage:
    python3 scripts/lint_modules.py [--json] [--quiet]

Exit-code family: typed (0 = every structural invariant holds, 1 = findings, 2 = usage error).
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXPECTED_SECTIONS = (
    "Why it matters",
    "Intuition first",
    "Formalization",
    "Worked example",
    "Exercise",
    "Simulation path",
    "Checkpoint",
    "Common mistakes",
    "Resources",
    "Next modules",
)

REQUIRED_FRONT_MATTER = (
    "id",
    "title",
    "track",
    "tier",
    "prereqs",
    "new_concepts",
    "uses",
    "est_hours",
    "hardware_required",
    "safety_level",
)

# `scripts/new_module.py` writes this marker into every hole it leaves behind, so an unchanged
# scaffold can never be mistaken for a finished module (milestone M0 of the Tier 2/3 parity plan).
SCAFFOLD_MARKER = "TODO-AUTHOR"

REQUIRED_QUESTION_TAGS = ("[Recall]", "[Apply]", "[Transfer]")

# Ladder stage -> content marker, shared with `scripts/module_parity.py` so both tools publish the
# same coverage number. It has to be the marker a learner needs, not a bare mention: the loose
# `\bpredict\b` read counted 12 modules and `\bdiagnos\w*` counted 20, against the 7 that carry the
# committed prediction and the worked fault. Reported for every stage, gated only for the ones at
# 44/44.
LADDER_MARKERS: dict[str, str] = {
    "1 Recall": r"\[Recall\]",
    "2 See it": r"^##\s*2\.\s*Intuition first",
    "3 Predict": r"\*\*Predict first \(before you run it\):\*\*",
    "4 Work through": r"^##\s*4\.\s*Worked example",
    "5 Practice (host)": r"^##\s*5\.\s*Exercise",
    "5 Practice (scaffold)": r"`TODO|\bhints?\b|Step 1[:.]",
    "6 Break it": (
        r"^###\s*Break it on purpose"
        r"(?=[\s\S]*\*\*Inject)(?=[\s\S]*\*\*Symptom)"
        r"(?=[\s\S]*\*\*Diagnose)(?=[\s\S]*\*\*Fix)"
    ),
    "7 Transfer": r"\[Transfer\]",
    "8 Integrate": r"^##\s*10\.\s*Next modules",
}

GATE_MARKERS = ("1 Recall", "2 See it", "4 Work through", "5 Practice (host)", "7 Transfer", "8 Integrate")

NUMBERED_SECTION = re.compile(r"^##\s*(\d+)\.\s*(.+?)\s*$", re.MULTILINE)


def module_files() -> list[str]:
    return sorted(glob.glob(os.path.join(ROOT, "modules", "*.md")))


def parse_front_matter(text: str) -> list[str]:
    if not text.startswith("---\n"):
        return ["missing YAML front matter (`---`) at line 1"]
    end = text.find("\n---\n", 4)
    if end == -1:
        return ["unclosed YAML front matter (`---`)"]
    keys = {line.split(":", 1)[0].strip() for line in text[4:end].splitlines() if re.match(r"^[A-Za-z_][\w-]*:", line)}
    return [f"front matter is missing `{key}`" for key in REQUIRED_FRONT_MATTER if key not in keys]


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint the bridge modules' teaching-ladder structure.")
    parser.add_argument("--json", action="store_true", help="emit the coverage table as JSON")
    parser.add_argument("--quiet", action="store_true", help="print the summary line only")
    args = parser.parse_args()

    files = module_files()
    if not files:
        print("ERROR: no modules/*.md found", file=sys.stderr)
        return 2

    findings: list[str] = []
    rows: list[dict[str, object]] = []

    for path in files:
        rel = os.path.relpath(path, ROOT)
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read()

        for error in parse_front_matter(text):
            findings.append(f"{rel}: {error}")

        sections = [(int(m.group(1)), m.group(2)) for m in NUMBERED_SECTION.finditer(text)]
        numbers = [number for number, _ in sections]
        titles = [title for _, title in sections]
        if numbers != list(range(1, len(numbers) + 1)):
            findings.append(f"{rel}: numbered sections are not a 1..N sequence ({numbers})")
        for expected_index, expected in enumerate(EXPECTED_SECTIONS, start=1):
            found = next((title for number, title in sections if number == expected_index), None)
            if found is None:
                findings.append(f"{rel}: no `## {expected_index}. {expected}` section")
            elif not found.lower().startswith(expected.lower()):
                findings.append(f"{rel}: section {expected_index} is `{found}`, expected `{expected}`")
        if not re.search(r"^###\s*Skip test", text, flags=re.MULTILINE):
            findings.append(f"{rel}: no `### Skip test` section directly under the Checkpoint")
        for tag in REQUIRED_QUESTION_TAGS:
            if tag not in text:
                findings.append(f"{rel}: no `{tag}` question tag")

        if SCAFFOLD_MARKER in text:
            findings.append(
                f"{rel}: still carries the `{SCAFFOLD_MARKER}` scaffold marker - replace every one of "
                "them with real content before this counts as a module"
            )

        stages = {stage: bool(re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)) for stage, pattern in LADDER_MARKERS.items()}
        for stage in GATE_MARKERS:
            if not stages[stage]:
                findings.append(f"{rel}: gated ladder stage `{stage}` has no structural marker")
        rows.append({"module": rel, "sections": len(sections), "stages": stages})

    coverage = {stage: sum(1 for row in rows if row["stages"][stage]) for stage in LADDER_MARKERS}  # type: ignore[index]
    gated_gaps = {stage: coverage[stage] for stage in LADDER_MARKERS if coverage[stage] < len(rows)}

    if args.json:
        print(json.dumps({"modules": len(rows), "coverage": coverage, "gaps": gated_gaps, "rows": rows}, indent=2))
    elif not args.quiet:
        print(f"Teaching-ladder coverage across the {len(rows)} advanced bridge modules (docs/SYLLABUS.md section C):")
        print("| Ladder stage | Modules carrying it | Gate |")
        print("| :--- | :--- | :--- |")
        for stage in LADDER_MARKERS:
            carried = coverage[stage]
            gate = "gated" if stage in GATE_MARKERS else "reported"
            mark = "" if carried == len(rows) else "  **<- gap**"
            print(f"| {stage} | {carried}/{len(rows)}{mark} | {gate} |")

    if findings:
        print(f"FAIL: {len(findings)} structural finding(s) in modules/:", file=sys.stderr)
        for finding in findings[:40]:
            print(f"  - {finding}", file=sys.stderr)
        return 1

    widest = max(int(row["sections"]) for row in rows)
    print(
        f"OK: {len(rows)} bridge modules carry the {widest}-section sequence, the front-matter contract, "
        f"`### Skip test` with {', '.join(REQUIRED_QUESTION_TAGS)} questions, and every gated ladder stage "
        f"({', '.join(GATE_MARKERS)}). Reported gaps stay visible above; teaching quality is a human review."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
