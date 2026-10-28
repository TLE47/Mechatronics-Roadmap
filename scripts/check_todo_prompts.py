#!/usr/bin/env python3
"""Fail when a numbered `TODO n:` marker hands the learner the expression it asks for.

The failure this prevents, reported by a learner: `TODO 1: Compute
new_pos_m = start_pos_m + (wheel_speed * elapsed_sec)` can be answered by retyping the marker, so
the exercise tests typing rather than thinking. A marker must name the quantity, the law or the unit
conversion in words, and leave the arithmetic to the learner.

Scanned: the learner-facing pages (`modules/`, `track-p/`, `ramp/`, `stage-0/`, the nine numbered
course folders) and the starters they copy (`exercises/*/starter.py`). A marker's continuation lines
are judged too: a wrapped line that carries the expression leaks just as much as the first line.

What counts as an expression:

    a code span                 `innovation`
    an assignment/comparison    x = ..., <=, ==
    a power                     **
    a call                      sqrt(...), type(exc)
    a product or quotient       f_sample / N, m*x, 2*pi/60
    a matrix row or list        [0, -wz, wy], [c, s; -s, c]
    an index                    config['slope']

Prose, plain units ('100 nF', '60 s per minute'), numeric ranges ('[0, 255]') and em dashes pass.

Usage
    python3 scripts/check_todo_prompts.py            # human summary, exit 1 on a finding
    python3 scripts/check_todo_prompts.py --json     # machine-readable, stdout only

Exit-code family: typed
    0  every marker asks for the work in words
    1  at least one marker carries the expression
    2  the command line is wrong
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COURSE_DIRS = [
    "00-foundations",
    "01-electronics-and-power",
    "02-mechanics-kinematics-dynamics",
    "03-sensors-and-actuators",
    "04-embedded-and-realtime",
    "05-control-and-estimation",
    "06-robotics-and-autonomy",
    "07-systems-hil-and-production",
    "08-capstone-projects",
]

# The marker itself: `TODO 3:` anywhere on the line (comment, docstring or string literal).
MARKER = re.compile(r"(?<![A-Za-z])TODO\s+(\d+)\s*:")

# Ordered: the first match is the finding's label. Narrow shapes come before the wide ones so a
# matrix row is reported as a matrix row, not as a product.
SHAPES: list[tuple[str, re.Pattern[str]]] = [
    ("a code span", re.compile(r"`")),
    ("a matrix row or list of names", re.compile(r"\[[^\]]*[;][^\]]*\]")),
    ("a matrix row or list of names", re.compile(r"\[[^\]]*,\s*[-+]?[A-Za-z_]\w*\s*,\s*[A-Za-z_]")),
    ("a matrix row or list of names", re.compile(r"\[[^\]]*[,;]\s*-[A-Za-z_]\w*")),
    ("a power", re.compile(r"\*\*")),
    ("an assignment or comparison", re.compile(r"[=<>!]=|(?<![<>=!])=(?!=)")),
    ("a call", re.compile(r"\b[A-Za-z_]\w*\(")),
    ("an index", re.compile(r"\b[A-Za-z_]\w*\[")),
    ("a product or quotient", re.compile(r"(?:\b[A-Za-z_]\w*|\d)\s*\*\s*(?:\b[A-Za-z_]\w*|\d)")),
    # A slash is only arithmetic when it is spaced: `f_sample / N`. Units such as `rad/s`,
    # `nH/ns` and `mOhm` are prose and must keep their notation.
    ("a product or quotient", re.compile(r"(?:\b[A-Za-z_]\w*|\d)\s+/\s+(?:\b[A-Za-z_]\w*|\d)")),
]


def sources() -> list[str]:
    """Every page and starter a learner reads a marker in, sorted."""
    paths: list[str] = []
    for folder in ("modules", "track-p", "ramp", "stage-0", *COURSE_DIRS):
        paths.extend(glob.glob(os.path.join(ROOT, folder, "*.md")))
    paths.extend(glob.glob(os.path.join(ROOT, "exercises", "*", "starter.py")))
    return sorted(set(paths))


def block_of(lines: list[str], start: int) -> list[str]:
    """The marker line plus the comment/string continuation lines that belong to it."""
    block = [lines[start]]
    for follow in lines[start + 1:]:
        stripped = follow.strip()
        if not stripped or MARKER.search(follow):
            break
        # A `#` comment or a quoted string continues the sentence; anything else is code.
        if not stripped.startswith(("#", '"', "'")):
            break
        block.append(follow)
    return block


def leak(text: str) -> str | None:
    """The shape this line leaks, or None when it reads as prose."""
    for label, pattern in SHAPES:
        if pattern.search(text):
            return label
    return None


def unwrap(text: str) -> str:
    """The marker's own words, without the comment or string literal that carries them."""
    body = text.strip()
    body = re.sub(r"^[#\s]+", "", body)
    body = re.sub(r"^['\"]+", "", body)
    body = re.sub(r"['\")]+\s*$", "", body)
    return body


def problems_in(text: str, rel: str) -> list[dict]:
    findings = []
    lines = text.splitlines()
    for index, line in enumerate(lines):
        match = MARKER.search(line)
        if not match:
            continue
        block = block_of(lines, index)
        for offset, entry in enumerate(block):
            # The first line's code wrapper (`raise NotImplementedError("`) is not the marker.
            body = unwrap(entry[match.end():] if offset == 0 else entry)
            label = leak(body)
            if label:
                findings.append(
                    {
                        "file": rel,
                        "line": index + 1 + offset,
                        "shape": label,
                        "text": entry.strip(),
                    }
                )
                break
    return findings


def main(argv: list[str]) -> int:
    if any(arg in ("-h", "--help") for arg in argv):
        print(__doc__)
        return 0
    if any(arg != "--json" for arg in argv):
        print("usage: check_todo_prompts.py [--json]", file=sys.stderr)
        return 2

    paths = sources()
    findings: list[dict] = []
    markers = 0
    for path in paths:
        rel = os.path.relpath(path, ROOT)
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read()
        markers += len(MARKER.findall(text))
        findings.extend(problems_in(text, rel))

    if "--json" in argv:
        print(json.dumps({"markers": markers, "files": len(paths), "findings": findings}, indent=2))
    elif findings:
        print(f"TODO PROMPTS: {len(findings)} marker(s) hand over the expression:")
        for finding in findings:
            print(f"  {finding['file']}:{finding['line']}  {finding['shape']}")
            print(f"    {finding['text']}")
        print(
            "\nName the quantity, the law or the conversion in words and leave the arithmetic out; "
            "a learner must not be able to answer by retyping the marker."
        )
    else:
        print(f"OK: {markers} TODOs in {len(paths)} files ask for the work in words, with no expression to retype.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
