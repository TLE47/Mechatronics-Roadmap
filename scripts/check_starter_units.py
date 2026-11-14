#!/usr/bin/env python3
"""Audit the units of the quantities a lesson's starter code names.

Why this exists: a starter block hands the learner a set of numbers — `J`, `B`, `TAU`, `KP`, `cpi`,
`buf_used` — and then asks them to compute a torque, an angle or a current from those numbers. If the
block never says what the numbers *are*, the arithmetic still runs, the Expected Output still
matches, and the learner can finish the lesson believing `TAU = 0.40` is a torque "in whatever the
rest of the code uses". This repository's lessons are read by people with no prior units training;
the unit is part of the given value, not a detail for later.

The bar, for every numeric literal assigned to a plain name in a lesson's starter block (a
`python` fenced block that contains a `TODO` — the blocks the workbench loads):

1. the **name** says it — `L1_M`, `TAU_NM`, `WINDING_OHM`, `DT_MS` — or names the quantity as one
   that cannot have a unit (`counts`, `ticks`, `steps`, `teeth`, `ratio`, `index`, `pct`, `cpr`,
   `pwm`, `bytes`, `bits`, `samples`, `frames`, `turns`, `rev`);
2. or the **annotation** says it: a trailing `# ...` on the same line, or a comment line directly
   above it, carries a unit (`V`, `A`, `N m`, `kg m^2`, `rad/s`, `µs`, `mm`, `Hz`, `%`, `counts`,
   `dimensionless`, ...).

A single bare `g` is deliberately *not* accepted as grams: in these blocks `g` is the gravity
constant far more often than a mass, and the abbreviation that is ambiguous is the one that has to
be written out. `gram`/`grams` is accepted.

Modes:

- `--check` (default, and what CI runs) walks the working tree and exits 1 on any finding, printing
  `path:line: name = <literal> — no unit in the name or the annotation`.
- `--rev REV` audits a commit instead of the tree, which is how the rule is proved against the
  state it was written for: `--rev <base>` reports the gap this check closed, `--check` reports 0.
- `--json` prints the findings as JSON, for a report rather than a person.

Exit codes: `0` clean, `1` findings, `2` bad command line (the same family as `lint_assertions.py`).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_DIRS = ("node_modules", "app/", "site/", "dist/", "build/", ".git/")

# The fenced block the workbench loads: a python block with at least one TODO in it.
BLOCK = re.compile(r"```python[ \t]*\n(.*?)```", re.S)

# `NAME = <number literal>` optionally annotated. Expressions, calls, lists and hex masks are not
# literal givens and are out of scope.
NUMBER = r"-?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"
ASSIGN = re.compile(rf"^(\s*)([A-Za-z_]\w*)\s*=\s*({NUMBER})\s*(?:#\s*(.*))?$")
# `J, b, tau_g, u_max, dt = 0.02, 0.05, 0.60, 1.20, 0.001` gives five quantities at once, and is the
# shape a plant model arrives in.
TUPLE = re.compile(
    rf"^(\s*)([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=\s*"
    rf"((?:{NUMBER})(?:\s*,\s*(?:{NUMBER}))+)\s*(?:#\s*(.*))?$"
)
COMMENT_LINE = re.compile(r"^\s*#(.*)$")

# A unit as a word, or as the tail of an underscored name. Compounds the lessons write
# (`rads2`, `ns_per_m`, `mah`, `mvs`) are matched through the underscore-separated tokens below.
UNIT_WORDS = {
    # length
    "mm", "cm", "um", "nm", "km",
    # mass
    "kg", "mg", "gram", "grams", "lbm",
    # time
    "sec", "secs", "second", "seconds", "ms", "us", "ns", "min", "mins", "minute", "minutes",
    "hr", "hrs", "hour", "hours",
    # angle
    "rad", "rads", "rads2", "deg", "degs", "degree", "degrees", "turn", "turns",
    # electrical
    "volt", "volts", "mv", "kv", "amp", "amps", "ma", "ua", "ohm", "ohms", "farad",
    "uf", "nf", "pf", "hz", "khz", "mhz", "watt", "watts", "mw", "kw", "joule", "joules",
    "mj", "mah", "ah", "celsius", "kelvin",
    # rotational mechanics
    "nm", "nm_per_rad", "ns_per_m", "kgm2", "kg_m2", "torque", "newton", "newtons",
    # signals and rates
    "bps", "kbps", "bps_per_s", "sps", "rpm", "s_per_rad", "rad_per_s",
}
# The same vocabulary as it appears in a prose annotation (a comment written by a person, so it can
# carry a symbol the name cannot: `N·m`, `m/s^2`, `µs`, `°`, `%`).
UNIT_COMMENT = re.compile(
    r"(?<![\w.])("
    r"kg|mg|grams?|lbm|"
    r"mm|cm|um|µm|nm|km|metres?|meters?|"
    r"ms|us|µs|ns|min|mins|minutes?|hours?|hrs?|"
    r"rads?|rad/s\^?2?|deg|degs|degrees?|°|"
    r"volts?|mV|kV|V|amps?|mA|uA|µA|A|ohms?|Ω|"
    r"farads?|uF|nF|pF|F|Hz|kHz|MHz|"
    r"watts?|mW|kW|W|joules?|mJ|J|kelvin|K|"
    r"newtons?|N·m|N m|N\.m|N\*m|Nm|kg\s*m\^?2|kg·m²|kg m2|"
    r"m/s\^?2|m/s²|m/s|mm/s|rad/s|rpm|%|"
    r"counts?|ticks?|steps?|teeth|turns?|revs?|bytes?|bits?|samples?|frames?|"
    r"ratio|fraction|dimensionless|index|indices|percent|duty"
    r")(?![\w])"
)

# A unit written first in an annotation is that line's unit — `# s, the joint's first-order lag`,
# `# m/s^2, gravity`, `# counts per output turn`. Bare `s` and `m` are only read this way, never
# from the middle of a sentence, where a stray article would pass for a unit.
LEADING_UNIT = re.compile(
    r"^\s*("
    r"kg|mg|grams?|mm|cm|um|µm|nm|km|ms|us|µs|ns|s|sec|secs|seconds?|minutes?|mins?|hours?|h|"
    r"rad/s|rads?|deg|degs|degrees?|°|mV|kV|V|volts?|mA|uA|A|amps?|ohms?|Ω|"
    r"Hz|kHz|MHz|mW|kW|W|watts?|mJ|J|joules?|N|N·m|N m|N\.m|N\*m|Nm|newtons?|"
    r"kg·m²|kg\s*m\^?2|m/s\^?2|m/s²|m/s|mm/s|rpm|%|"
    r"counts?|ticks?|steps?|teeth|turns?|revs?|bytes?|bits?|samples?|frames?|"
    r"ratio|fraction|dimensionless|index|indices|percent|duty|"
    r"m"
    r")(?=$|[\s,;:.()\[\]—–-])"
)

# A quantity that cannot carry a unit, named in the variable itself.
DIMENSIONLESS = (
    "count", "counts", "tick", "ticks", "step", "steps", "teeth", "ratio", "ratios", "index",
    "pct", "percent", "fraction", "cpr", "pwm", "byte", "bytes", "bit", "bits", "sample",
    "samples", "frame", "frames", "turn", "turns", "rev", "revs", "num", "id", "flag", "bool",
    "polynomial", "seed", "mask", "addr", "address", "port", "pin",
)


def fence_blocks(text: str):
    """Every starter block in a page, as (first_body_line, [lines])."""
    for match in BLOCK.finditer(text):
        body = match.group(1)
        if "TODO" not in body:
            continue
        first = text[: match.start()].count("\n") + 2
        yield first, body.split("\n")


# A one-letter unit is only read as the *suffix* of a longer name (`L1_M`, `DT_S`, `SUPPLY_V`), and
# only for the letters that are unambiguous here. `_a`, `_b`, `_c`, `_d` and `_n` are labels in this
# corpus — `part_a`, `q_d`, `f_c`, `ratio_n` — so those names have to say their unit in a comment.
SUFFIX_UNITS = ("m", "s", "v", "w", "j")


def name_is_quantified(name: str) -> bool:
    """True when the name itself says what the number is, unit or counted quantity."""
    low = name.lower()
    tokens = [t for t in re.split(r"_+", low) if t]
    if any(t in UNIT_WORDS for t in tokens):
        return True
    if len(tokens) >= 2 and tokens[-1] in SUFFIX_UNITS:
        return True
    return any(word in low for word in DIMENSIONLESS)


def annotation_says_unit(annotation: str, previous: str) -> bool:
    if annotation and (LEADING_UNIT.match(annotation) or UNIT_COMMENT.search(annotation)):
        return True
    if previous is not None and UNIT_COMMENT.search(previous):
        return True
    return False


def audit_text(path: str, text: str):
    findings = []
    for first, lines in fence_blocks(text):
        for offset, line in enumerate(lines):
            tuple_match = TUPLE.match(line)
            if tuple_match:
                names = [part.strip() for part in tuple_match.group(2).split(",")]
                values = [part.strip() for part in tuple_match.group(3).split(",")]
                if len(names) != len(values) or all(name_is_quantified(n) for n in names):
                    continue
                annotation = tuple_match.group(4) or ""
                previous = None
                if offset > 0:
                    above = COMMENT_LINE.match(lines[offset - 1])
                    previous = above.group(1) if above else None
                if annotation_says_unit(annotation, previous):
                    continue
                unlabelled = [n for n in names if not name_is_quantified(n)]
                findings.append(
                    {
                        "path": path,
                        "line": first + offset,
                        "name": ", ".join(unlabelled),
                        "value": ", ".join(values),
                        "text": line.strip(),
                    }
                )
                continue
            match = ASSIGN.match(line)
            if not match:
                continue
            name = match.group(2)
            if name_is_quantified(name):
                continue
            annotation = match.group(4) or ""
            previous = None
            if offset > 0:
                above = COMMENT_LINE.match(lines[offset - 1])
                previous = above.group(1) if above else None
            if annotation_says_unit(annotation, previous):
                continue
            findings.append(
                {
                    "path": path,
                    "line": first + offset,
                    "name": name,
                    "value": match.group(3),
                    "text": line.strip(),
                }
            )
    return findings


def lesson_pages_from_tree() -> list[str]:
    pages = []
    for base, dirs, files in os.walk(ROOT):
        rel_base = os.path.relpath(base, ROOT).replace(os.sep, "/")
        if rel_base != "." and any(rel_base.startswith(skip.rstrip("/")) for skip in SKIP_DIRS):
            dirs[:] = []
            continue
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "dist", "site", "app")]
        for name in sorted(files):
            if name.endswith(".md"):
                pages.append(os.path.join(rel_base, name) if rel_base != "." else name)
    return sorted(pages)


def lesson_pages_from_rev(rev: str) -> list[str]:
    listed = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", rev],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [
        path
        for path in listed.split("\n")
        if path.endswith(".md") and not any(path.startswith(skip.rstrip("/")) for skip in SKIP_DIRS)
    ]


def read_from_rev(rev: str, path: str) -> str:
    return subprocess.run(
        ["git", "show", f"{rev}:{path}"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="audit the working tree (default)")
    parser.add_argument("--rev", metavar="REV", help="audit a git revision instead of the tree")
    parser.add_argument("--json", action="store_true", help="print findings as JSON")
    args = parser.parse_args()

    findings = []
    if args.rev:
        for path in lesson_pages_from_rev(args.rev):
            findings += audit_text(path, read_from_rev(args.rev, path))
    else:
        for path in lesson_pages_from_tree():
            with open(os.path.join(ROOT, path), encoding="utf-8") as handle:
                findings += audit_text(path, handle.read())

    where = f"at {args.rev}" if args.rev else "in the working tree"
    if args.json:
        print(json.dumps({"where": where, "count": len(findings), "findings": findings}, indent=2))
    else:
        for finding in findings:
            print(
                f"{finding['path']}:{finding['line']}: {finding['name']} = {finding['value']} "
                "— no unit in the name or the annotation"
            )
        files = len({finding["path"] for finding in findings})
        print(
            f"\n[{'FAIL' if findings else 'PASS'}] Starter units {where}: {len(findings)} "
            f"unlabelled quantity(ies) in {files} page(s). A starter given is a measurement: say "
            "what it measures in the name or the comment above it."
        )
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
