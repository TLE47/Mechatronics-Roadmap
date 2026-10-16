#!/usr/bin/env python3
"""
Module Scaffolder for Tier 2/3 Parity (`scripts/new_module.py`)

Milestone M0 of the Tier 1 parity plan: every Tier 2/3 module is meant to reach the same
standard as a Tier 1 lesson, and hand-copying that shape is how the standard drifts. This
script writes a **draft** module with the whole contract already in place - the ten numbered
sections `scripts/lint_modules.py` gates, the `### Skip test` tags, the two ladder stages that
are still reported rather than gated (`**Predict first (before you run it):**` and
`### Break it on purpose`), and the two parity fields the coverage table scores
(`difficulty:` and `verification:`) - so authoring is filling holes, not inventing structure.

**Every unwritten hole carries the literal marker `TODO-AUTHOR`.** An unchanged scaffold is
therefore detectable: `scripts/lint_modules.py` refuses a module that still carries the
marker, so scaffolding can never be mistaken for coverage.

Usage:
    python3 scripts/new_module.py 05-control.T2.01a --track 05 --tier 2 --title "Discrete Poles ..." \\
        --prereqs 05-control.T1.06,00-foundations.T2.04 --est-hours 4.0 --index
    python3 scripts/new_module.py <id> ... --dry-run      # print the draft, write nothing

Exit-code family: typed (0 = draft written, 1 = refusal (file exists / id already indexed),
2 = usage error).
"""

from __future__ import annotations

import argparse
import os
import re
import sys

VERSION = "1.0.0"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULES_DIR = os.path.join(ROOT, "modules")
INDEX_PATH = os.path.join(MODULES_DIR, "_index.yaml")

SCAFFOLD_MARKER = "TODO-AUTHOR"

HARDWARE_RISKS = ("low", "medium", "high")
SIMULATIONS = ("full", "partial", "none")
VERIFICATIONS = ("browser", "ci-native", "artifact", "rubric")

# Section bodies: the heading order is the one lint_modules.py gates (section N must start with
# EXPECTED_SECTIONS[N-1]); everything below each heading is a hole for the author.
SECTION_BODIES: tuple[tuple[str, str], ...] = (
    (
        "Why it matters",
        f"{SCAFFOLD_MARKER}: two or three sentences naming the concrete failure this prevents, with "
        "real numbers from the shared plant (not adjectives).",
    ),
    (
        "Intuition first",
        f"{SCAFFOLD_MARKER}: one physical analogy, before any equation or code.",
    ),
    (
        "Formalization",
        f"{SCAFFOLD_MARKER}: numbered definitions and equations in KaTeX (`$...$` or `$$...$$`), each "
        "with its units, and every assumption stated (no \"always\"/\"guaranteed\" without one).",
    ),
    (
        "Worked example",
        "**Predict first (before you run it):** "
        f"{SCAFFOLD_MARKER}: a quantitative prediction to commit to before the code runs - a number, "
        "or an ordering - followed by the signature of a wrong answer (what a mistake looks like).\n\n"
        f"{SCAFFOLD_MARKER}: one worked example, every intermediate step shown, closing with a "
        "dimensional unit check.\n\n"
        "```python\n"
        f"# {SCAFFOLD_MARKER}: replace with the runnable worked example for this module.\n"
        f'raise NotImplementedError("{SCAFFOLD_MARKER}: worked example not written yet")\n'
        "```\n"
        "Expected output:\n"
        "```text\n"
        f"{SCAFFOLD_MARKER}: the exact stdout of the block above (scripts/validate_modules.py diffs it)\n"
        "```",
    ),
    (
        "Exercise",
        f"{SCAFFOLD_MARKER}: the task, the answer with its tolerance, and a hint for the case where the "
        "learner's result differs.\n\n"
        "```python\n"
        f"# {SCAFFOLD_MARKER}: starter code. Leave the assembly to the learner; the `TODO 1` markers\n"
        f"# are what the ladder linter reads as supported practice.\n"
        f"# TODO 1: {SCAFFOLD_MARKER}\n"
        "```\n\n"
        "### Break it on purpose\n"
        f"- **Inject:** {SCAFFOLD_MARKER}: one realistic, planted fault (wrong units, swapped phases, a "
        "transposed matrix, the wrong frame order, a sample time that is too large).\n"
        f"- **Symptom:** {SCAFFOLD_MARKER}: exactly what the learner sees, with numbers.\n"
        f"- **Diagnose:** {SCAFFOLD_MARKER}: how that symptom localises the fault and rules the others out.\n"
        f"- **Fix:** {SCAFFOLD_MARKER}: the repair, plus the measurement that proves the repair worked.",
    ),
    (
        "Simulation path",
        f"{SCAFFOLD_MARKER}: the workbench tab or simulator that runs this with no hardware, and the "
        "pass/fail numbers to watch. Add a Mermaid flowchart here - scripts/verify_repo.py parses "
        "every Mermaid block.\n\n"
        "### Safety notes\n"
        f"> {SCAFFOLD_MARKER}: state the hazard and its limit (matching `safety_level:`), or say plainly "
        "that no hardware is required.",
    ),
    (
        "Checkpoint",
        f"{SCAFFOLD_MARKER}: the pass criteria - which asserts must run clean, or the Skip-test score.\n\n"
        "### Gate test\n"
        f"{SCAFFOLD_MARKER}: the one task that proves this module before the next one starts.\n\n"
        "### Skip test\n"
        f"1. `[Recall] [Concept: <slug>]` {SCAFFOLD_MARKER}: a question on this module's own new concept.\n"
        f"2. `[Apply] [Concept: <slug>]` {SCAFFOLD_MARKER}: a numerical question with a tolerance.\n"
        f"3. `[Transfer] [Concept: <slug>]` {SCAFFOLD_MARKER}: the same idea at a changed parameter or "
        "requirement.\n"
        f"4. `[Spaced review -> <prereq id> - Concept: <slug>]` {SCAFFOLD_MARKER}: a four-option "
        "question (A-D), one correct.\n\n"
        "**Answer key:**\n"
        "```python\n"
        f"# {SCAFFOLD_MARKER}: one assert per question above.\n"
        "```",
    ),
    (
        "Common mistakes",
        "| Symptom | Root cause | 2-minute fix |\n"
        "| :--- | :--- | :--- |\n"
        f"| {SCAFFOLD_MARKER} | {SCAFFOLD_MARKER} | {SCAFFOLD_MARKER} |",
    ),
    (
        "Resources",
        f"- {SCAFFOLD_MARKER}: primary resource, with the exact heading to read, marked "
        "`[UNVERIFIED]` until `scripts/check_links.py` passes and `resources_verified: true` is set.",
    ),
    (
        "Next modules",
        f"- {SCAFFOLD_MARKER}: the next module id and the one thing it adds.",
    ),
)


def module_text(
    module_id: str,
    title: str,
    track: str,
    tier: int,
    prereqs: list[str],
    new_concepts: list[str],
    uses: list[str],
    est_hours: float,
    hardware_required: bool,
    safety_level: str,
    difficulty: dict[str, object],
) -> str:
    def yaml_list(name: str, items: list[str]) -> str:
        if not items:
            return f"{name}: []"
        return "\n".join([f"{name}:"] + [f"  - {item}" for item in items])

    # The neighbours write `est_hours: 4.0`, so keep one decimal for whole hours.
    hours = f"{est_hours:g}" + (".0" if float(est_hours).is_integer() else "")

    front_matter = "\n".join(
        [
            "---",
            f"id: {module_id}",
            f'title: "{title}"',
            f'track: "{track}"',
            f"tier: {tier}",
            yaml_list("prereqs", prereqs),
            yaml_list("new_concepts", new_concepts),
            yaml_list("uses", uses),
            f"est_hours: {hours}",
            f"hardware_required: {'true' if hardware_required else 'false'}",
            f"safety_level: {safety_level}",
            "resources_verified: false",
            "difficulty:",
            f"  math: {difficulty['math']}",
            f"  coding: {difficulty['coding']}",
            f"  tools: {difficulty['tools']}",
            f"  hardware_risk: {difficulty['hardware_risk']}",
            f"  simulation: {difficulty['simulation']}",
            f"verification: {difficulty['verification']}",
            "---",
        ]
    )

    sections = "\n\n".join(
        f"## {index}. {name}\n{body}" for index, (name, body) in enumerate(SECTION_BODIES, start=1)
    )
    return f"{front_matter}\n\n{sections}\n"


def index_entry(
    module_id: str,
    title: str,
    track: str,
    tier: int,
    prereqs: list[str],
    new_concepts: list[str],
    uses: list[str],
    est_hours: float,
    hardware_required: bool,
    safety_level: str,
) -> str:
    def inline(name: str, items: list[str]) -> str:
        return f"{name}: [{', '.join(items)}]" if items else f"{name}: []"

    hours = f"{est_hours:g}" + (".0" if float(est_hours).is_integer() else "")
    return "\n".join(
        [
            f"  - id: {module_id}",
            f'    title: "{title}"',
            f"    track: {track}",
            f"    tier: {tier}",
            f"    est_hours: {hours}",
            "    " + inline("prereqs", prereqs),
            "    " + inline("introduces", new_concepts),
            "    " + inline("uses", uses),
            "    feeds_into: []",
            f"    safety_level: {safety_level}",
            f"    hardware_required: {'true' if hardware_required else 'false'}",
            "    resources_verified: false",
            f"    path: modules/{module_id}.md",
        ]
    )


def index_insert_offset(text: str) -> int:
    """Where a new `bridges:` entry belongs: at the end of that list, before the next top-level key.

    The index is not guaranteed to end with `bridges:` — `tracks:` (the per-track `lint_level:`
    block) follows it — so the entry is inserted into the list rather than appended to the file.
    """
    keys = [
        (match.start(), match.group(1))
        for match in re.finditer(r"^([a-z_]+):", text, flags=re.MULTILINE)
    ]
    if not any(key == "bridges" for _, key in keys):
        raise ValueError(f"{os.path.relpath(INDEX_PATH, ROOT)} has no `bridges:` list to append to")
    bridges_start = next(start for start, key in keys if key == "bridges")
    later = [start for start, _ in keys if start > bridges_start]
    return later[0] if later else len(text)


def append_index(entry: str) -> None:
    with open(INDEX_PATH, "r", encoding="utf-8") as handle:
        text = handle.read()
    offset = index_insert_offset(text)
    head = text[:offset].rstrip("\n")
    tail = text[offset:].lstrip("\n")
    with open(INDEX_PATH, "w", encoding="utf-8") as handle:
        handle.write(f"{head}\n{entry}\n\n{tail}" if tail else f"{head}\n{entry}\n")


def split_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="new_module.py",
        description="Scaffold a Tier 2/3 bridge module carrying the full Tier 1 parity contract.",
        epilog=(
            "Every unwritten hole is marked TODO-AUTHOR; scripts/lint_modules.py refuses a module "
            "that still carries the marker. Exit-code family: typed."
        ),
    )
    parser.add_argument("module_id", help="module id, e.g. 05-control.T2.01a")
    parser.add_argument("--track", required=True, help="track number, e.g. 05")
    parser.add_argument("--tier", required=True, type=int, choices=(1, 2, 3), help="1, 2 or 3")
    parser.add_argument("--title", required=True, help="module title (quoted)")
    parser.add_argument("--prereqs", default="", help="comma-separated prerequisite module ids")
    parser.add_argument("--new-concepts", default="", help="comma-separated new-concept slugs")
    parser.add_argument("--uses", default="", help="comma-separated earlier-concept slugs this reuses")
    parser.add_argument("--est-hours", type=float, default=4.0, help="estimated author hours (default 4.0)")
    parser.add_argument("--math", type=int, choices=(1, 2, 3, 4, 5), default=3, help="difficulty.math, 1-5")
    parser.add_argument("--coding", type=int, choices=(1, 2, 3, 4, 5), default=3, help="difficulty.coding, 1-5")
    parser.add_argument(
        "--tools",
        type=int,
        choices=(0, 1, 2, 3, 4, 5),
        default=2,
        help="difficulty.tools: how many new tools this module introduces, 0-5",
    )
    parser.add_argument(
        "--hardware-risk",
        choices=HARDWARE_RISKS,
        default="low",
        help="difficulty.hardware_risk (medium/high implies hardware_required=true)",
    )
    parser.add_argument(
        "--simulation",
        choices=SIMULATIONS,
        default="full",
        help="difficulty.simulation: can this be completed without hardware?",
    )
    parser.add_argument(
        "--verification",
        choices=VERIFICATIONS,
        default="browser",
        help="how this module's exercise is checked (see docs/QUALITY_SPEC.md)",
    )
    parser.add_argument(
        "--hardware-required",
        choices=("true", "false"),
        default=None,
        help="hardware_required: true|false (default: derived from --hardware-risk)",
    )
    parser.add_argument("--index", action="store_true", help="append the bridge entry to modules/_index.yaml")
    parser.add_argument("--dry-run", action="store_true", help="print the draft and write nothing")
    parser.add_argument("-q", "--quiet", action="store_true", help="print only the essential output")
    parser.add_argument("-V", "--version", action="version", version=f"new_module.py {VERSION}")
    args = parser.parse_args(argv)

    module_path = os.path.join(MODULES_DIR, f"{args.module_id}.md")
    prereqs = split_list(args.prereqs)
    new_concepts = split_list(args.new_concepts) or [f"{SCAFFOLD_MARKER}_new_concept_slug"]
    uses = split_list(args.uses)
    safety_level = args.hardware_risk
    hardware_required = (
        args.hardware_required == "true"
        if args.hardware_required is not None
        else args.hardware_risk != "low"
    )
    difficulty: dict[str, object] = {
        "math": args.math,
        "coding": args.coding,
        "tools": args.tools,
        "hardware_risk": args.hardware_risk,
        "simulation": args.simulation,
        "verification": args.verification,
    }

    if not os.path.isdir(MODULES_DIR):
        print(f"ERROR: {os.path.relpath(MODULES_DIR, ROOT)} does not exist", file=sys.stderr)
        return 2

    text = module_text(
        args.module_id,
        args.title,
        args.track,
        args.tier,
        prereqs,
        new_concepts,
        uses,
        args.est_hours,
        hardware_required,
        safety_level,
        difficulty,
    )
    entry = index_entry(
        args.module_id,
        args.title,
        args.track,
        args.tier,
        prereqs,
        new_concepts,
        uses,
        args.est_hours,
        hardware_required,
        safety_level,
    )

    # Refuse before writing anything, so a refusal leaves no half-scaffolded module behind.
    if args.index:
        with open(INDEX_PATH, "r", encoding="utf-8") as handle:
            index_text = handle.read()
        if f"id: {args.module_id}\n" in index_text:
            print(
                f"ERROR: {args.module_id} is already listed in modules/_index.yaml",
                file=sys.stderr,
            )
            return 1
        try:
            index_insert_offset(index_text)
        except ValueError as error:
            print(f"ERROR: {error}", file=sys.stderr)
            return 1

    if args.dry_run:
        sys.stdout.write(text)
        if args.index:
            sys.stdout.write(f"\n--- modules/_index.yaml (bridges:) ---\n{entry}\n")
        return 0

    if os.path.exists(module_path):
        print(
            f"ERROR: {os.path.relpath(module_path, ROOT)} already exists - edit it, or pick another id",
            file=sys.stderr,
        )
        return 1

    with open(module_path, "w", encoding="utf-8") as handle:
        handle.write(text)
    if not args.quiet:
        print(f"wrote {os.path.relpath(module_path, ROOT)}")

    if args.index:
        try:
            append_index(entry)
        except (OSError, ValueError) as error:
            print(f"ERROR: {error}", file=sys.stderr)
            return 1
        if not args.quiet:
            print("appended the bridges entry to modules/_index.yaml")
    elif not args.quiet:
        print(f"index entry for modules/_index.yaml (bridges:), add it or re-run with --index:\n{entry}")

    if not args.quiet:
        print(
            f"draft carries {text.count(SCAFFOLD_MARKER)} `{SCAFFOLD_MARKER}` holes; "
            "scripts/lint_modules.py refuses the module until they are gone"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
