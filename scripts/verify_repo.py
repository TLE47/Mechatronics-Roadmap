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
    "scripts/audit_math.mjs",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "src/main.tsx",
    "src/App.tsx",
    "src/curriculumData.ts",
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
# `$...$` / `$$...$$` produces the GitHub (MathJax) render error "\cmd is only supported in math mode".
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
    """Reproduce GitHub's heading anchor: one dash per space, not per run of spaces.

    "Tier 3 (Advanced / Production)" loses the punctuation and keeps BOTH spaces around
    the removed slash, so GitHub's anchor is `tier-3-advanced--production`; collapsing
    runs of whitespace reported every link to such a heading as broken.
    """
    slug = text.strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"\s", "-", slug)
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

    The opposite mistake is also rejected: wrapping escaped prices in a math span
    (`$\$350 - \$420$`) renders as nothing useful, so the escapes must stand alone.
    """
    issues: list[str] = []
    for match in re.finditer(r"\$\\\$", raw):
        issues.append(
            f"{rel_path}:{lineno}: currency wrapped in a math span '{raw[match.start():match.start() + 16]}...' "
            f"- write \\$350 without the surrounding $...$"
        )
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


def unescaped_display_positions(line: str) -> list[int]:
    """Column offsets of unescaped `$$` on a line (`\$` currency is skipped)."""
    positions: list[int] = []
    i = 0
    while i < len(line):
        if line[i] == "\\":
            i += 2
            continue
        if line.startswith("$$", i):
            positions.append(i)
            i += 2
            continue
        i += 1
    return positions


def find_display_math_layout_issues(text: str, rel_path: str) -> list[str]:
    """Reject display-math layouts that GitHub's MathJax silently leaves as literal text.

    Verified against GitHub's `/markdown` API: a `$$...$$` block renders only when the
    delimiters stand alone at column 0 with a blank line on both sides. Each of these
    falls back to printing `$$` and the raw LaTeX:

    1. a delimiter glued to content (`$$\begin{aligned}`, `...\end{aligned}$$`);
    2. an indented block inside a list item, once that item's text contains inline math;
    3. no blank line before the opener, so the block cannot start its own paragraph;
    4. no blank line after the closer, so the next line is absorbed into the block.
    """
    issues: list[str] = []
    lines = text.splitlines()
    in_fence = False
    i = 0
    while i < len(lines):
        raw = lines[i]
        if raw.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
            i += 1
            continue
        if in_fence:
            i += 1
            continue

        positions = unescaped_display_positions(raw)
        if not positions:
            i += 1
            continue

        if raw.strip() != "$$":
            issues.append(
                f"{rel_path}:{i + 1}: display math '$$' is glued to content "
                f"- put '$$' alone on its own line, with a blank line before and after"
            )
        elif raw != "$$":
            issues.append(
                f"{rel_path}:{i + 1}: display math '$$' is indented inside a list item; a block "
                f"whose item text also contains inline math does not render on GitHub"
            )
        if i > 0 and lines[i - 1].strip():
            issues.append(f"{rel_path}:{i + 1}: missing blank line before a display math block")

        j = i + 1
        closer = -1
        while j < len(lines):
            if unescaped_display_positions(lines[j]):
                closer = j
                break
            j += 1
        if closer < 0:
            i += 1
            continue

        closer_raw = lines[closer]
        if closer_raw.strip() != "$$":
            issues.append(
                f"{rel_path}:{closer + 1}: display math '$$' is glued to content "
                f"- put '$$' alone on its own line at column 0"
            )
        elif closer_raw != "$$":
            issues.append(
                f"{rel_path}:{closer + 1}: display math '$$' is indented inside a list item"
            )
        if closer + 1 < len(lines) and lines[closer + 1].strip():
            issues.append(f"{rel_path}:{closer + 1}: missing blank line after a display math block")
        i = closer + 1

    return issues


# Text-mode LaTeX groups. TeX switches to text mode inside these, so math-only
# commands are illegal there and MathJax refuses the whole span.
def has_unquoted_semicolon(line: str) -> bool:
    """True when `;` splits a statement, i.e. real content follows it.

    Mermaid uses `;` as a statement separator, so `A->>B: do x; do y` is read as two
    statements and the trailing fragment is not a valid sequence message, which GitHub
    reports as "Parse error ... Expecting 'SOLID_OPEN_ARROW' ... got 'NEWLINE'".
    A trailing `;` (as written by many `classDef ...;` lines) merely terminates the
    statement and parses fine, and `;;` opens a comment, so neither is flagged.
    """
    in_quotes = False
    for i, ch in enumerate(line):
        if ch == '"':
            in_quotes = not in_quotes
        elif ch == ";" and not in_quotes:
            if i + 1 < len(line) and line[i + 1] == ";":
                return False
            return bool(line[i + 1 :].strip())
    return False


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

# Shell pages that host math. The workbench's own formulas live in `src/**` (checked by
# `find_source_math_issues`), and the old static `web/` pages were replaced by the Vite app.
MATH_HTML_FILES = ("index.html",)

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
            if "\\_" in inner:
                issues.append(
                    f"{rel_path}:{lineno}: '\\_' inside text mode '{group.group(0)}...' - "
                    f"MathJax implements no macros in text-mode material, so GitHub drops the "
                    f"whole formula with \"'_' allowed only in math mode\"; close the group "
                    f"around the underscore, e.g. '\\text{{ESD}}\\_\\text{{fault}}'"
                )
            if re.search(r"(?<!\\)&", inner):
                issues.append(
                    f"{rel_path}:{lineno}: bare '&' inside text mode '{group.group(0)}...' "
                    f"- MathJax rejects it with '& can not be used here'"
                )

    return issues


# Failures that erase a single formula without touching the rest of the page: MathJax
# leaves an empty box, and the workbench (KaTeX) prints a red parse-error box in its place.
_DANGLING_SCRIPT_RE = re.compile(r"[\^_]\s*$")
_BARE_AMP_RE = re.compile(r"(?<!\\)&(?![a-zA-Z]+;|#\d+;)")
_MATH_SPAN_RE = re.compile(r"(?<!\\)\$(?!\$)([^$\n]{1,400}?)(?<!\\)\$(?!\$)")
_TYPE_MATH_RE = re.compile(r"""equation:\s*'((?:[^'\\]|\\.)*)'""")
_JSX_MATH_RE = re.compile(r"""math=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})""")


def check_math_render(tex: str, where: str) -> list[str]:
    """Formulas neither engine can render, whatever container they sit in."""
    issues: list[str] = []
    if _BARE_AMP_RE.search(tex) and r"\begin{" not in tex:
        issues.append(
            f"{where}: bare '&' inside math ('{tex.strip()[:40]}') - it is an alignment "
            f"character outside an environment, so both KaTeX and MathJax reject it; write '\\&'"
        )
    if _DANGLING_SCRIPT_RE.search(tex):
        issues.append(
            f"{where}: math span ends with a dangling script marker "
            f"('{tex.strip()[:40]}') - '^' and '_' need an argument, e.g. '$v_d^{{*}}$'"
        )
    return issues


def find_math_render_issues(text: str, rel_path: str) -> list[str]:
    """Render-safety of every inline `$...$` span."""
    issues: list[str] = []
    in_fence = False

    for lineno, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        line = re.sub(r"`[^`]*`", "", raw)
        for match in _MATH_SPAN_RE.finditer(line):
            issues.extend(check_math_render(match.group(1), f"{rel_path}:{lineno}"))

    return issues


def find_source_math_issues(text: str, rel_path: str) -> list[str]:
    """The workbench renders these literals with KaTeX, so hold them to the same bar.

    `equation: '...'` goes through a JavaScript string literal (so `\\\\` in the file is
    one backslash by the time KaTeX sees it) while `math="..."` in JSX is raw attribute
    text and keeps every backslash as written.
    """
    issues: list[str] = []

    for match in _TYPE_MATH_RE.finditer(text):
        tex = match.group(1).replace("\\\\", "\\").replace("\\'", "'")
        lineno = text.count("\n", 0, match.start()) + 1
        issues.extend(check_math_render(tex, f"{rel_path}:{lineno}"))

    for match in _JSX_MATH_RE.finditer(text):
        tex = next(group for group in match.groups() if group is not None)
        lineno = text.count("\n", 0, match.start()) + 1
        issues.extend(check_math_render(tex, f"{rel_path}:{lineno}"))

    return issues


_CONTAINER_LINK_RE = re.compile(r"\[([^\]\n]*)\]\(([^)\n]*)\)")
_CONTAINER_EMPH_RE = re.compile(r"(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)")
_CONTAINER_MATH_RE = re.compile(r"(?<!\\)\$(?!\$)([^$\n]{1,200}?)(?<!\\)\$(?!\$)")


def find_container_math_issues(text: str, rel_path: str) -> list[str]:
    """Inline math that GitHub silently refuses to render, by container.

    Verified against GitHub's own renderer: `$...$` renders in a paragraph, in
    **bold**, in a heading, in a table cell and in a blockquote, but NOT inside
    [a link label](url) nor inside *italic* runs; and a heading whose bare
    `[brackets]` parse as a shortcut reference link swallows its math as well.
    There the `$` survives as literal text and the formula never typesets.
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

        line = re.sub(r"`[^`]*`", "", raw)

        for match in _CONTAINER_LINK_RE.finditer(line):
            if _CONTAINER_MATH_RE.search(match.group(1)):
                issues.append(
                    f"{rel_path}:{lineno}: inline math inside a link label never renders "
                    f"('{match.group(1)[:36]}...') - move the formula out of the label "
                    f"or write it as plain text"
                )

        # A `*` inside a formula is a starred quantity (`$v_d^{*}$`), not an emphasis
        # delimiter, so mask the math spans first: what remains is real emphasis, and the
        # check is whether that run wraps a formula (GitHub then drops the formula).
        math_masked = _CONTAINER_MATH_RE.sub(lambda m: "\x05" * len(m.group(0)), line)
        for match in _CONTAINER_EMPH_RE.finditer(math_masked):
            if _CONTAINER_MATH_RE.search(line[match.start() : match.end()]):
                issues.append(
                    f"{rel_path}:{lineno}: inline math inside *italics* never renders "
                    f"('{match.group(1)[:36]}...') - split the emphasis so the formula sits outside"
                )

        if re.match(r"^#{1,6} ", line):
            for match in re.finditer(r"\[([^\[\]\n]*)\](?!\()", line):
                if _CONTAINER_MATH_RE.search(match.group(1)):
                    issues.append(
                        f"{rel_path}:{lineno}: bare '[brackets]' in a heading parse as a "
                        f"shortcut reference link, which suppresses its math - drop the brackets"
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

    # Only the repository's own Markdown: a local or CI `npm install` drops hundreds of
    # dependency READMEs under node_modules/, and the build output belongs to Vite.
    skipped = {"node_modules", ".git", "dist", ".aistudio"}
    md_files = sorted(
        p
        for p in repo_root.rglob("*.md")
        if not skipped.intersection(p.relative_to(repo_root).parts)
    )
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

        for issue in find_display_math_layout_issues(text, rel_path):
            errors.append(issue)

        for issue in find_text_mode_math_issues(text, rel_path):
            errors.append(issue)

        for issue in find_container_math_issues(text, rel_path):
            errors.append(issue)

        for issue in find_math_render_issues(text, rel_path):
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
                if not m_line.startswith("%%") and has_unquoted_semicolon(m_line):
                    errors.append(
                        f"{rel_path}: Mermaid block #{idx} has content after an unquoted ';', which "
                        f"Mermaid treats as a statement separator and splits the statement, causing "
                        f"'Parse error ... got NEWLINE': '{m_line}'"
                    )
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

    # The workbench app typesets its own math with KaTeX, where a bad formula shows as a
    # red parse-error box inside the tab instead of a formula.
    src_dir = repo_root / "src"
    if src_dir.is_dir():
        for src_path in sorted(src_dir.rglob("*")):
            if src_path.suffix not in {".ts", ".tsx"}:
                continue
            src_rel = src_path.relative_to(repo_root).as_posix()
            src_text = src_path.read_text(encoding="utf-8")
            for issue in find_source_math_issues(src_text, src_rel):
                errors.append(issue)
            for issue in find_text_mode_math_issues(src_text, src_rel):
                errors.append(issue)
            for issue in find_math_render_issues(src_text, src_rel):
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
