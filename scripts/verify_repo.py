#!/usr/bin/env python3
"""verify_repo.py — Automated integrity, link, and Mermaid validator for mechatronics-roadmap.

Exit-code family: typed (0 = all checks passed, 1 = validation findings, 2 = usage error).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sys
from pathlib import Path
from typing import Any

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

VERSION = "1.0.0"

EXPECTED_FILES = [
    "README.md",
    "index.html",
    "00-foundations/README.md",
    "00-foundations/lab/lab00_two_mass_and_so3.py",
    "01-electronics-and-power/README.md",
    "01-electronics-and-power/lab/lab01_power_and_afe.py",
    "02-mechanics-kinematics-dynamics/README.md",
    "02-mechanics-kinematics-dynamics/lab/lab02_poe_and_rnea.py",
    "02-mechanics-kinematics-dynamics/cad/cad_parametric_parts.py",
    "02-mechanics-kinematics-dynamics/cad/validate_cad_parts.py",
    "02-mechanics-kinematics-dynamics/cad/notch_flexure_hinge.step",
    "02-mechanics-kinematics-dynamics/cad/notch_flexure_hinge.stl",
    "02-mechanics-kinematics-dynamics/cad/kelvin_kinematic_coupling.step",
    "02-mechanics-kinematics-dynamics/cad/kelvin_kinematic_coupling.stl",
    "02-mechanics-kinematics-dynamics/cad/cad_manifest.json",
    "03-sensors-and-actuators/README.md",
    "03-sensors-and-actuators/lab/lab03_foc_and_metrology.py",
    "04-embedded-and-realtime/README.md",
    "04-embedded-and-realtime/lab/lab04_realtime_embedded.cpp",
    "05-control-and-estimation/README.md",
    "05-control-and-estimation/lab/lab05_eskf_mpc_and_cbf.py",
    "06-robotics-and-autonomy/README.md",
    "06-robotics-and-autonomy/lab/lab06_impedance_and_ruckig.py",
    "07-systems-hil-and-production/README.md",
    "07-systems-hil-and-production/lab/lab07_sysid_hil_and_sto.py",
    "08-capstone-projects/README.md",
    "08-capstone-projects/cad/qdd_planetary_carrier.step",
    "08-capstone-projects/cad/qdd_planetary_carrier.stl",
    "08-capstone-projects/eda-capstone1-foc-drive/generate_foc_pcb_and_bom.py",
    "08-capstone-projects/eda-capstone1-foc-drive/capstone1_foc_48v30a.net",
    "08-capstone-projects/eda-capstone1-foc-drive/capstone1_bom.csv",
    "08-capstone-projects/eda-capstone1-foc-drive/foc_thermal_and_bom.json",
    "08-capstone-projects/firmware-capstone1-stm32g474/stm32g474_foc_firmware.cpp",
    "08-capstone-projects/models/validate_models.py",
    "08-capstone-projects/models/capstone2-furuta-pendulum/furuta_pendulum.urdf",
    "08-capstone-projects/models/capstone2-furuta-pendulum/furuta_pendulum.xml",
    "08-capstone-projects/models/capstone3-6dof-arm/manipulator_6dof.urdf",
    "08-capstone-projects/models/capstone3-6dof-arm/manipulator_6dof.xml",
    "08-capstone-projects/models/capstone4-qdd-hopper/qdd_hopper_leg.urdf",
    "08-capstone-projects/models/capstone4-qdd-hopper/qdd_hopper_leg.xml",
    "resources/textbooks-and-papers.md",
    "resources/open-source-toolchains.md",
    "resources/lab-workbench-bom.md",
    "resources/mechatronics-cheatsheet.md",
    "scripts/verify_repo.py",
    "scripts/run_all_labs.py",
    "web/index.html",
    "web/cheatsheet.html",
    ".github/workflows/ci.yml",
]

VALID_MERMAID_HEADERS = (
    "flowchart ",
    "graph ",
    "sequenceDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "journey",
    "classDiagram",
    "erDiagram",
    "gantt",
    "mindmap",
)

LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
FENCE_RE = re.compile(r"^```(\w*)\s*$", re.MULTILINE)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)

# LaTeX commands that MUST appear inside math delimiters. Emitting one of these outside
# `$...$` / `$$...$$` produces the GitHub/KaTeX render error "\cmd is only supported in math mode".
LATEX_CMD_RE = re.compile(
    r"\\(?:"
    r"cdot|cdots|vdots|ddots|frac|dfrac|tfrac|sqrt|text|textbf|textit|textsf|textrm|mathrm|mathbf|mathit|mathbb|mathcal|mathfrak|boldsymbol|operatorname"
    r"|tau|theta|Theta|omega|Omega|alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|kappa|lambda|Lambda|mu|nu|xi|pi|Pi|rho|sigma|Sigma|phi|Phi|varphi|chi|psi|Psi"
    r"|partial|nabla|infty|int|iint|oint|sum|prod|lim|log|ln|exp|sin|cos|tan|tanh|sinh|cosh|arcsin|arccos|arctan|sign|max|min|arg|det|tr|diag"
    r"|le|leq|ge|geq|ne|neq|approx|simeq|equiv|sim|propto|ll|gg|pm|mp|times|div|ast|star|circ|bullet|oplus|otimes"
    r"|left|right|big|Big|bigg|Bigg|lvert|rvert|vert|Vert|lVert|rVert"
    r"|dot|ddot|dddot|bar|hat|tilde|vec|overline|underline|overbrace|underbrace|widehat|widetilde|cancel"
    r"|top|bot|perp|parallel|angle|langle|rangle|lceil|rceil|lfloor|rfloor|setminus|subset|supset|subseteq|supseteq|cup|cap|in|notin|forall|exists"
    r"|quad|qquad|;|,|!|:|to|mapsto|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|iff|implies|prime"
    r"|begin|end|mathrm|operatorname|mathop|overset|underset|substack|displaystyle|textstyle|hat|breve|check|acute|grave"
    r"|Delta|Gamma|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega"
    r"![a-zA-Z]"
    r")"
)


def slugify_heading(text: str) -> str:
    slug = text.strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    return slug


def extract_anchors(md_text: str) -> set[str]:
    anchors: set[str] = set()
    for match in HEADING_RE.finditer(md_text):
        anchors.add(slugify_heading(match.group(2)))
    return anchors


def extract_mermaid_blocks(md_text: str) -> list[str]:
    blocks: list[str] = []
    in_mermaid = False
    current: list[str] = []
    for line in md_text.splitlines():
        stripped = line.strip()
        if not in_mermaid and stripped.startswith("```mermaid"):
            in_mermaid = True
            current = []
        elif in_mermaid and stripped == "```":
            in_mermaid = False
            blocks.append("\n".join(current))
        elif in_mermaid:
            current.append(line)
    return blocks


def find_math_hygiene_issues(text: str, rel_path: str) -> list[str]:
    """Detect Markdown/LaTeX constructs that break GitHub's math renderer.

    1. A raw (unescaped) `|` inside `$...$`/`$$...$$` on a pipe-table row splits the table cell,
       leaving the trailing LaTeX outside math mode -> "\cmd is only supported in math mode".
    2. Display math `$$...$$` inside a pipe-table row never renders on GitHub.
    3. Any LaTeX command emitted while NOT inside math delimiters.
    4. Inline math that opens and never closes on the same line.
    """
    issues: list[str] = []
    in_fence = False
    in_display = False

    for lineno, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        is_table_row = stripped.startswith("|")
        in_inline = False
        i = 0
        n = len(raw)
        while i < n:
            ch = raw[i]
            if ch == "\\":
                if i + 1 < n:
                    nxt = raw[i + 1]
                    if nxt == "\\":
                        i += 2
                        continue
                    if nxt == "$":
                        i += 2
                        continue
                    cmd_match = LATEX_CMD_RE.match(raw, i)
                    if cmd_match and not in_inline and not in_display:
                        issues.append(
                            f"{rel_path}:{lineno}: LaTeX command '{cmd_match.group(0)}' outside math mode"
                        )
                    i += 2
                    continue
                i += 1
                continue
            if ch == "$":
                if i + 1 < n and raw[i + 1] == "$":
                    if in_display:
                        in_display = False
                    elif in_inline:
                        in_inline = False
                    else:
                        if is_table_row:
                            issues.append(
                                f"{rel_path}:{lineno}: display math '$$' inside a table row does not render on GitHub"
                            )
                        in_display = True
                    i += 2
                    continue
                if not in_display:
                    in_inline = not in_inline
                i += 1
                continue
            if ch == "|" and (in_inline or in_display) and is_table_row:
                issues.append(
                    f"{rel_path}:{lineno}: unescaped '|' inside math on a table row (cell split) "
                    f"- use \\lvert/\\rvert"
                )
            i += 1

        if in_inline:
            issues.append(f"{rel_path}:{lineno}: unbalanced inline math '$' delimiter")

        for msg in find_currency_math_issues(raw, rel_path, lineno):
            issues.append(msg)

    return issues


def find_currency_math_issues(raw: str, rel_path: str, lineno: int) -> list[str]:
    """Flag bare `$` currency symbols that silently open phantom inline math.

    A price written as `~$500 - $800 USD` is parsed by GitHub as an inline math span
    (`500 - `) followed by stray text, which either renders as nonsense or errors.
    Prices must be escaped as `\$500`. Legitimate math such as `$30\text{ A}$` is unaffected.
    """
    issues: list[str] = []
    dollars: list[int] = []
    i = 0
    n = len(raw)
    while i < n:
        if raw[i] == "\\":
            i += 2
            continue
        if raw[i] == "$" and not (i + 1 < n and raw[i + 1] == "$"):
            dollars.append(i)
        if raw[i] == "$" and i + 1 < n and raw[i + 1] == "$":
            i += 2
            continue
        i += 1

    for idx in range(0, len(dollars) - 1, 2):
        open_pos = dollars[idx]
        close_pos = dollars[idx + 1]
        segment = raw[open_pos + 1:close_pos]
        next_char = raw[close_pos + 1] if close_pos + 1 < n else ""
        is_currency_sandwich = next_char.isdigit()
        mentions_currency = "USD" in segment.upper()
        if is_currency_sandwich or mentions_currency:
            issues.append(
                f"{rel_path}:{lineno}: bare '$' parsed as inline math in '{raw[open_pos:close_pos + 1]}' "
                f"- escape currency as \\$"
            )

    return issues


# Text-mode LaTeX groups. TeX switches to text mode inside these, so math-only
# commands are illegal there and MathJax refuses the whole span.
TEXT_MODE_GROUPS = (
    "text",
    "textrm",
    "textnormal",
    "textup",
    "textit",
    "textbf",
    "mbox",
    "operatorname",
)

# Commands that only exist in math mode. Using any of these inside `\text{...}` makes
# GitHub report e.g. "`\cdot` is only supported in math mode" and drop the formula.
MATH_ONLY_COMMANDS = frozenset(
    """
    cdot cdots ldots ddots vdots dots dot ddot frac dfrac tfrac cfrac sqrt sum prod
    int iint iiint oint partial nabla infty pm mp times div le leq leqslant ge geq
    geqslant neq ne nequiv approx sim simeq cong equiv propto ll gg to mapsto rightarrow
    leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow implies iff in notin
    subset supset subseteq supseteq cup cap wedge vee oplus ominus otimes oslash perp
    parallel angle triangle circ bullet star ast lvert rvert lVert rVert vert Vert mid
    neg lnot forall exists nexists emptyset varnothing quad qquad left right big Big bigg
    Bigg overline underline overbrace underbrace stackrel overset underset binom choose
    mathbf mathrm mathcal mathbb mathit mathsf mathtt mathfrak boldsymbol vec hat bar
    tilde widehat widetilde begin end matrix bmatrix pmatrix cases aligned array hbar ell
    Re Im aleph wp partial differential square blacksquare geqslant lfloor rfloor lceil
    rceil langle rangle longrightarrow longleftarrow uparrow downarrow hline
    alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda
    mu nu xi omicron pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi
    omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega
    """.split()
)

MATH_HTML_FILES = (
    "web/index.html",
    "deploy/public/index.html",
    "web/cheatsheet.html",
    "deploy/public/cheatsheet.html",
)

_TEXT_GROUP_RE = re.compile(r"\\(?:" + "|".join(TEXT_MODE_GROUPS) + r")\s*\{")
_MATH_CMD_RE = re.compile(r"\\([a-zA-Z]+)")


def find_text_mode_math_issues(text: str, rel_path: str) -> list[str]:
    """Detect math-only LaTeX commands used inside text-mode groups (`\\text{...}`).

    GitHub renders Markdown math with MathJax. Inside `\\text{}` TeX is in text mode,
    where a math-only command such as `\\cdot` is illegal; MathJax then errors with
    "\\cdot is only supported in math mode" and drops the entire formula.
    The fix is to close the text group around the symbol: `\\text{N}\\cdot\\text{m}`.
    """
    issues: list[str] = []
    in_fence = False

    for lineno, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        for group in _TEXT_GROUP_RE.finditer(raw):
            start = group.end()
            depth = 1
            i = start
            n = len(raw)
            while i < n and depth:
                if raw[i] == "\\":
                    i += 2
                    continue
                if raw[i] == "{":
                    depth += 1
                elif raw[i] == "}":
                    depth -= 1
                i += 1
            inner = raw[start : i - 1 if depth == 0 else n]
            for cmd in _MATH_CMD_RE.finditer(inner):
                name = cmd.group(1)
                if name in MATH_ONLY_COMMANDS:
                    issues.append(
                        f"{rel_path}:{lineno}: math-only command '\\{name}' inside text mode "
                        f"'{group.group(0)}...' - MathJax fails with '\\{name} is only supported "
                        f"in math mode'; close the group before it, e.g. '\\text{{N}}\\{name}\\text{{m}}'"
                    )
            if re.search(r"(?<!\\)&", inner):
                issues.append(
                    f"{rel_path}:{lineno}: bare '&' inside text mode '{group.group(0)}...' "
                    f"- MathJax rejects it with '& can not be used here'"
                )

    return issues


def verify_repository(repo_root: Path) -> dict[str, Any]:
    errors: list[str] = []
    file_stats: list[dict[str, Any]] = []
    total_mermaid = 0
    total_links = 0
    total_lines = 0

    for rel in EXPECTED_FILES:
        fpath = repo_root / rel
        if not fpath.is_file():
            errors.append(f"Missing expected file: {rel}")

    md_files = sorted(repo_root.rglob("*.md"))
    anchors_cache: dict[Path, set[str]] = {}
    for md_path in md_files:
        anchors_cache[md_path.resolve()] = extract_anchors(md_path.read_text(encoding="utf-8"))

    for md_path in md_files:
        rel_path = md_path.relative_to(repo_root).as_posix()
        text = md_path.read_text(encoding="utf-8")
        lines = text.splitlines()
        total_lines += len(lines)

        fence_count = sum(1 for line in lines if line.strip().startswith("```"))
        if fence_count % 2 != 0:
            errors.append(f"{rel_path}: Unbalanced markdown code fences (count={fence_count})")

        # Math block delimiter linting ($$ ... $$ balanced)
        display_math_markers = text.count("$$")
        if display_math_markers % 2 != 0:
            errors.append(f"{rel_path}: Unbalanced display math '$$' delimiters (count={display_math_markers})")

        m_blocks = extract_mermaid_blocks(text)
        total_mermaid += len(m_blocks)
        if len(m_blocks) == 0 and rel_path != "resources/textbooks-and-papers.md":
            errors.append(f"{rel_path}: Expected at least 1 Mermaid diagram, found 0")

        for issue in find_math_hygiene_issues(text, rel_path):
            errors.append(issue)

        for issue in find_text_mode_math_issues(text, rel_path):
            errors.append(issue)

        for idx, block in enumerate(m_blocks, start=1):
            non_empty = [ln.strip() for ln in block.splitlines() if ln.strip()]
            if not non_empty:
                errors.append(f"{rel_path}: Mermaid block #{idx} is empty")
                continue
            first_line = non_empty[0]
            if not first_line.startswith(VALID_MERMAID_HEADERS):
                errors.append(
                    f"{rel_path}: Mermaid block #{idx} has unrecognized header: '{first_line}'"
                )
            for m_line in non_empty:
                # GitHub Mermaid parser fails on unquoted parentheses/brackets inside edge labels -->|...()...|
                for edge_match in re.finditer(r"\|([^|]+)\|", m_line):
                    label_inner = edge_match.group(1).strip()
                    if not (label_inner.startswith('"') and label_inner.endswith('"')):
                        if any(ch in label_inner for ch in "()[]{}"):
                            errors.append(
                                f"{rel_path}: Mermaid block #{idx} has unquoted special chars in edge label '|{label_inner}|'"
                            )

        file_link_count = 0
        for match in LINK_RE.finditer(text):
            target = match.group(2).strip()
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            file_link_count += 1
            total_links += 1
            if "#" in target:
                path_part, anchor_part = target.split("#", 1)
            else:
                path_part, anchor_part = target, ""

            target_path = (md_path.parent / path_part).resolve() if path_part else md_path.resolve()
            if not target_path.exists():
                errors.append(f"{rel_path}: Broken relative link '{target}'")
                continue
            if anchor_part and target_path in anchors_cache:
                if anchor_part.lower() not in anchors_cache[target_path]:
                    errors.append(
                        f"{rel_path}: Broken heading anchor '#{anchor_part}' in '{target}'"
                    )

        file_stats.append(
            {
                "file": rel_path,
                "lines": len(lines),
                "mermaid_diagrams": len(m_blocks),
                "internal_links": file_link_count,
            }
        )

    # The workbench/cheat-sheet pages render math with MathJax on GitHub Pages, so the
    # same text-mode rule applies to their inline `$...$` and `$$...$$` spans.
    for rel in MATH_HTML_FILES:
        fpath = repo_root / rel
        if not fpath.is_file():
            continue
        for issue in find_text_mode_math_issues(fpath.read_text(encoding="utf-8"), rel):
            errors.append(issue)

    return {
        "ok": len(errors) == 0,
        "repo_root": str(repo_root.resolve()),
        "markdown_files": len(md_files),
        "total_lines": total_lines,
        "total_mermaid_diagrams": total_mermaid,
        "total_internal_links": total_links,
        "files": file_stats,
        "errors": errors,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="verify_repo.py",
        description=(
            "Validate all Markdown modules, Mermaid.js diagrams, relative links, "
            "and structural gates in the mechatronics-roadmap repository.\n"
            "Exit-code family: typed (0 = pass, 1 = findings, 2 = usage error)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-V", "--version", action="version", version=f"%(prog)s {VERSION}")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress non-error output")
    parser.add_argument("--verbose", action="store_true", help="Print per-file breakdown")
    parser.add_argument("--json", action="store_true", help="Emit clean JSON report to stdout")
    parser.add_argument("--no-input", action="store_true", help="Disable interactive input")
    parser.add_argument("--dry-run", action="store_true", help="Run read-only validation checks")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="Path to mechatronics-roadmap root directory",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    repo_root: Path = args.root
    if not repo_root.is_dir():
        sys.stderr.write(f"error: repository root does not exist: {repo_root}\n")
        return 2

    report = verify_repository(repo_root)

    if args.json:
        sys.stdout.write(json.dumps(report, indent=2) + "\n")
    elif not args.quiet:
        status = "PASS" if report["ok"] else "FAIL"
        sys.stdout.write(
            f"[{status}] files={report['markdown_files']} "
            f"lines={report['total_lines']} "
            f"mermaid={report['total_mermaid_diagrams']} "
            f"links={report['total_internal_links']} "
            f"errors={len(report['errors'])}\n"
        )
        if args.verbose:
            for item in report["files"]:
                sys.stdout.write(
                    f"  {item['file']:<46} "
                    f"lines={item['lines']:<4} "
                    f"mermaid={item['mermaid_diagrams']:<2} "
                    f"links={item['internal_links']}\n"
                )
        for err in report["errors"]:
            sys.stderr.write(f"ERROR: {err}\n")

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
