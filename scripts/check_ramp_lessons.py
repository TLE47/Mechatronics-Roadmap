#!/usr/bin/env python3
"""Check the maths-ramp lessons and the Tier 1 exit check stay in sync.

Three things are verified, each with the file it reads:

1. `ramp/R.*.md` — every `### Full Solution` python block runs and prints exactly the
   `### Expected Output` block above it. A lesson whose numbers drift from its code fails here.
2. `ramp/R.*.md` — every function the starter scaffolds (`def name(`) also exists in the full
   solution, so the TODOs describe code the learner can actually reach.
3. `docs/TIER1_EXIT_CHECK.md` — every item's `Ramp lesson` column names an existing
   `ramp/R.*.md` lesson, and every ramp lesson repairs at least one item. A check item pointing
   at a lesson that does not exist is the failure this project already made once with the
   coverage table, where a published number had no artifact behind it.

Exit codes: `0` all checks pass, `1` any finding, `2` the command line is wrong.
Exit-code family: typed.
"""

from __future__ import annotations

import glob
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK_DOC = os.path.join(ROOT, "docs", "TIER1_EXIT_CHECK.md")


def read(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def block_after(text: str, marker: str, lang: str) -> str:
    """The first fenced `lang` block that follows `marker`."""
    start = text.index(marker)
    fence = "```" + lang + "\n"
    open_at = text.index(fence, start)
    close_at = text.index("```", open_at + len(fence))
    return text[open_at + len(fence):close_at]


def normalized(output: str) -> list[str]:
    return [line.rstrip() for line in output.strip("\n").splitlines() if line.strip()]


def run_python(code: str) -> tuple[int, str]:
    proc = subprocess.run(
        [sys.executable, "-I", "-c", code],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=ROOT,
    )
    return proc.returncode, proc.stdout + proc.stderr


def check_lesson(path: str) -> list[str]:
    rel = os.path.relpath(path, ROOT)
    text = read(path)
    problems = []

    code = block_after(text, "<strong>Full Solution</strong>", "python")
    expected = block_after(text, "### Expected Output", "text")
    status, output = run_python(code)
    if status != 0:
        problems.append(f"[{rel}] the Full Solution block exits {status}:\n{output.strip()}")
    elif normalized(output) != normalized(expected):
        want = "\n".join(normalized(expected))
        got = "\n".join(normalized(output))
        problems.append(f"[{rel}] Full Solution output does not match Expected Output:\n--- want\n{want}\n--- got\n{got}")

    starter = block_after(text, "### Starter Code", "python")
    solution_names = set(re.findall(r"^def (\w+)\(", code, flags=re.MULTILINE))
    for name in re.findall(r"^def (\w+)\(", starter, flags=re.MULTILINE):
        if name not in solution_names:
            problems.append(f"[{rel}] starter scaffolds `{name}()` but the Full Solution never defines it")
    if "TODO 1" not in starter:
        problems.append(f"[{rel}] starter has no numbered `TODO 1`")

    return problems


def check_mapping(lessons: dict[str, str]) -> list[str]:
    """Every exit-check item names a ramp lesson that exists, and every lesson repairs an item."""
    if not os.path.exists(CHECK_DOC):
        return [f"[docs/TIER1_EXIT_CHECK.md] missing"]
    text = read(CHECK_DOC)
    problems = []
    cited: set[str] = set()
    rows = [
        line
        for line in text.splitlines()
        if line.startswith("| ") and re.match(r"^R\.\d+$", line.strip().strip("|").split("|")[-1].strip())
    ]
    if not rows:
        return ["[docs/TIER1_EXIT_CHECK.md] no item row carries an `R.x` ramp lesson in its last column"]
    for line in rows:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if not cells[0].isdigit():
            problems.append(f"[docs/TIER1_EXIT_CHECK.md] row with `{cells[-1]}` has no item number")
            continue
        lesson_id = cells[-1]
        if lesson_id not in lessons:
            problems.append(
                f"[docs/TIER1_EXIT_CHECK.md] item {cells[0]} points at `{lesson_id}`, "
                f"which is not one of {sorted(lessons)}"
            )
        else:
            cited.add(lesson_id)
    for lesson_id in lessons:
        if lesson_id not in cited:
            problems.append(
                f"[{os.path.relpath(lessons[lesson_id], ROOT)}] repairs no item in docs/TIER1_EXIT_CHECK.md"
            )
    return problems


def main(argv: list[str]) -> int:
    if any(arg in ("-h", "--help") for arg in argv):
        print(__doc__)
        return 0
    if any(arg not in ("--json",) for arg in argv):
        print("usage: check_ramp_lessons.py [--json]", file=sys.stderr)
        return 2

    paths = sorted(glob.glob(os.path.join(ROOT, "ramp", "R.*.md")))
    lessons = {}
    problems: list[str] = []
    if len(paths) < 2:
        problems.append(f"[ramp/] expected at least 2 ramp lessons, found {len(paths)}")
    for path in paths:
        match = re.search(r"^lesson_id:\s*\"?(R\.\d+)\"?", read(path), flags=re.MULTILINE)
        if not match:
            problems.append(f"[{os.path.relpath(path, ROOT)}] front matter has no `lesson_id: R.x`")
            continue
        lessons[match.group(1)] = path
        problems.extend(check_lesson(path))
    problems.extend(check_mapping(lessons))

    if "--json" in argv:
        import json

        print(json.dumps({"lessons": sorted(lessons), "problems": problems}, indent=2))
    elif problems:
        print("RAMP CHECK FAILED:")
        for problem in problems:
            print("  -", problem)
    else:
        print(
            f"OK: {len(lessons)} ramp lessons print their Expected Output and every "
            "exit-check item points at one of them."
        )
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
