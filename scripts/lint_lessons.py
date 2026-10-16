#!/usr/bin/env python3
"""
Automated Lesson Template & Topic-Alignment Linter (`scripts/lint_lessons.py`)

Enforces all curriculum design rules across all 35 beginner lessons:
- `track-p/P.*.md` (13 lessons: P.1 through P.12 + P.M)
- `stage-0/S0.*.md` (10 lessons: S0.1 through S0.9 + S0.M)
- `00-foundations/00.*.md` (3 lessons: 00.1 through 00.3)
- `01-electronics-and-power/01.*.md` (4 lessons: 01.1 through 01.4)
- `02-mechanics-kinematics-dynamics/02.*.md` (5 lessons: 02.1 through 02.5)
Total: 35 beginner lessons.

Checks enforced on every lesson:
1. Valid YAML front matter (`--- ... ---`) containing `lesson_id`, `title`, `ideas` (1..2 entries),
   `typical_hours`, and `slow_learner_hours`.
2. Exact H2 section sequence (`## Goal` -> `## Prerequisites` -> `## Learn` -> `## Do it yourself`
   -> `## Common mistakes & troubleshooting` -> `## Check yourself` -> `## Recap`).
3. Strict comparison of `## Learn` headings and `### Bridge Notes` against declared `ideas:`:
   - `### Idea N: <heading>` count must equal `len(ideas)` (max 2), and each heading must have
     >= 50% content-keyword overlap with its corresponding `ideas[N-1]` entry.
   - `### Bridge Notes` (150-250 prose words) must reference keywords from every declared idea,
     must not introduce extra H4 (`####`) topic headings, must not use any glossary term defined
     in a later lesson, and must not contain banned Tier 2/3 jargon (Jacobian determinants,
     phase-space ellipses, complex numbers, decibels/dB, Laplace s, SO(2)/SO(3), beam deflection 3EI).
4. Simulator/code separation in `## Do it yourself`:
   - Wokwi Arduino lessons (`S0.7`-`S0.M`, `01.2`): `cpp` sketch only (no Python mirror in lesson).
   - Falstad-only circuit lessons (`S0.1`-`S0.6`, `01.1`): Falstad netlist (`$ 1 ...`) only (no Python mirror in lesson).
   - Python lessons (`P.1`-`P.M`, `00.1`-`00.3`, `01.3`-`01.4`, `02.1`-`02.5`): `python` Starter Code and Full Solution.
"""

from __future__ import annotations

import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from check_term_order import PATH_ORDER_IDS, parse_glossary  # noqa: E402

EXPECTED_H2_ORDER = [
    "## Goal",
    "## Prerequisites",
    "## Learn",
    "## Do it yourself",
    "## Common mistakes & troubleshooting",
    "## Check yourself",
    "## Recap",
]

ARDUINO_ONLY_LESSONS = {
    "S0.7-arduino-uno-digital-io-and-pullups.md",
    "S0.8-adc-analog-read-and-serial-monitor.md",
    "S0.9-pwm-duty-cycle-and-analog-write.md",
    "S0.M-stage-0-milestone.md",
    "01.2-h-bridge-and-stall-current.md",
}

FALSTAD_ONLY_LESSONS = {
    "S0.1-closed-circuits-and-ohms-law.md",
    "S0.2-series-parallel-and-voltage-dividers.md",
    "S0.3-breadboards-and-short-circuits.md",
    "S0.4-leds-and-resistor-power.md",
    "S0.5-multimeters-and-current-limited-supplies.md",
    "S0.6-capacitors-and-decoupling.md",
    "01.1-mosfet-inductor-flyback.md",
}

STOPWORDS = {
    "the", "and", "or", "vs", "versus", "in", "on", "to", "of", "for", "with", "by", "from",
    "at", "as", "into", "how", "why", "a", "an", "via", "using", "between",
}

BANNED_TIER1_JARGON = [
    (r"\bjacobian\b", "Jacobian matrix/determinant"),
    (r"\bphase[- ]space\b", "phase-space ellipse"),
    (r"\bcomplex\s+numbers?\b|\bj\\omega\b", "complex numbers / j*omega"),
    (r"\bdecibels?\b|-3\s*\\text\{?\s*dB|-20\s*\\text\{?\s*dB", "decibels (dB)"),
    (r"\blaplace\b", "Laplace transform"),
    (r"\bSO\(2\)|\bSO\(3\)|\bSE\(3\)|\blie\s+groups?\b", "Lie groups SO(2)/SO(3)/SE(3)"),
    (r"3\s*E\s*I|192\s*E\s*I|\beuler[- ]bernoulli\b", "Euler-Bernoulli beam deflection formula"),
]


def natural_sort_key(path: str):
    parts = re.split(r"(\d+)", os.path.basename(path))
    return [int(p) if p.isdigit() else p for p in parts]


def get_lesson_files() -> list[str]:
    track_p = sorted(glob.glob(os.path.join(ROOT, "track-p", "P.*.md")), key=natural_sort_key)
    stage_0 = sorted(glob.glob(os.path.join(ROOT, "stage-0", "S0.*.md")), key=natural_sort_key)
    track_00 = sorted(glob.glob(os.path.join(ROOT, "00-foundations", "00.*.md")), key=natural_sort_key)
    track_01 = sorted(glob.glob(os.path.join(ROOT, "01-electronics-and-power", "01.*.md")), key=natural_sort_key)
    track_02 = sorted(
        glob.glob(os.path.join(ROOT, "02-mechanics-kinematics-dynamics", "02.*.md")),
        key=natural_sort_key,
    )
    return track_p + stage_0 + track_00 + track_01 + track_02


def parse_front_matter(text: str):
    errors = []
    if not text.startswith("---\n"):
        return {}, text, ["Missing YAML front matter (`---`) at line 1"]
    end_idx = text.find("\n---\n", 4)
    if end_idx == -1:
        return {}, text, ["Unclosed YAML front matter (`---`)"]
    fm_raw = text[4:end_idx]
    body = text[end_idx + 5 :]

    fm = {"ideas": []}
    in_ideas = False
    for line in fm_raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("ideas:"):
            in_ideas = True
            continue
        if in_ideas and stripped.startswith("- "):
            val = stripped[2:].strip().strip('"').strip("'")
            fm["ideas"].append(val)
            continue
        if ":" in stripped and not stripped.startswith("-"):
            in_ideas = False
            k, v = stripped.split(":", 1)
            fm[k.strip()] = v.strip().strip('"').strip("'")

    for req_key in ("lesson_id", "title", "typical_hours", "slow_learner_hours"):
        if req_key not in fm or not fm[req_key]:
            errors.append(f"Front matter missing required key `{req_key}:`")
    if not fm["ideas"]:
        errors.append("Front matter `ideas:` list is empty or missing")
    elif len(fm["ideas"]) > 2:
        errors.append(f"Front matter `ideas:` has {len(fm['ideas'])} entries (max 2 allowed)")

    return fm, body, errors


def extract_keywords(s: str) -> set[str]:
    s = s.lower()
    s = re.sub(r"\\text\{([^}]*)\}", r" \1 ", s)
    s = re.sub(r"\\[a-z]+", " ", s)
    tokens = re.findall(r"[a-z0-9]+", s)
    return {t for t in tokens if len(t) >= 2 and t not in STOPWORDS}


def count_prose_words(markdown_text: str) -> int:
    text = re.sub(r"```.*?```", " ", markdown_text, flags=re.DOTALL)
    text = re.sub(r"\$\$.*?\$\$", " ", text, flags=re.DOTALL)
    lines = [
        line
        for line in text.splitlines()
        if not line.strip().startswith("|") and not line.strip().startswith("#")
    ]
    cleaned = " ".join(lines)
    cleaned = re.sub(r"[*_`>|]", " ", cleaned)
    words = [w for w in cleaned.split() if re.search(r"[A-Za-z0-9]", w)]
    return len(words)


def lint_file(filepath: str, glossary_entries: list[tuple[str, str, str]]) -> list[str]:
    errors = []
    rel_path = os.path.relpath(filepath, ROOT)
    basename = os.path.basename(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        raw_text = f.read()

    fm, text, fm_errors = parse_front_matter(raw_text)
    errors.extend(fm_errors)
    lid = fm.get("lesson_id", "")

    # Check for banned Tier 2/3 jargon anywhere in the lesson
    body_no_skip = re.sub(r"^.*?\*\*What to skip:\*\*.*$", "", text, flags=re.MULTILINE)
    for pat, label in BANNED_TIER1_JARGON:
        if re.search(pat, body_no_skip, flags=re.IGNORECASE):
            errors.append(f"Contains banned Tier 2/3 jargon in Tier 1 lesson: {label}")

    # 1. Check H2 headings order
    h2_matches = list(re.finditer(r"^##\s+(.+)$", text, flags=re.MULTILINE))
    h2_titles = [f"## {m.group(1).strip()}" for m in h2_matches]
    if h2_titles != EXPECTED_H2_ORDER:
        errors.append(
            f"H2 sections do not match required order.\n"
            f"  Found:    {h2_titles}\n"
            f"  Expected: {EXPECTED_H2_ORDER}"
        )
        return [f"[{rel_path}] {e}" for e in errors]

    sections = {}
    for i, m in enumerate(h2_matches):
        sec_name = f"## {m.group(1).strip()}"
        start = m.end()
        end = h2_matches[i + 1].start() if i + 1 < len(h2_matches) else len(text)
        sections[sec_name] = text[start:end]

    # 2. Check ## Goal
    goal_sec = sections["## Goal"]
    goal_idea_items = re.findall(r"^\s+[12345]\.\s+\*\*", goal_sec, flags=re.MULTILINE)
    if len(goal_idea_items) != len(fm.get("ideas", [])):
        errors.append(
            f"## Goal lists {len(goal_idea_items)} numbered ideas, but YAML front matter `ideas:` has {len(fm.get('ideas', []))}"
        )
    if "- **New syntax" not in goal_sec:
        errors.append("## Goal missing `- **New syntax...` bullet")
    if "Typical:" not in goal_sec or "Slow-learner:" not in goal_sec:
        errors.append("## Goal missing Typical and Slow-learner time estimates")

    # 3. Check ## Learn strict idea headings and Bridge Notes topic alignment
    learn_sec = sections["## Learn"]
    learn_h3s = [m.group(1).strip() for m in re.finditer(r"^###\s+(.+)$", learn_sec, flags=re.MULTILINE)]
    idea_h3s = [h for h in learn_h3s if h.startswith("Idea ")]
    other_h3s = [h for h in learn_h3s if not h.startswith("Idea ")]

    if other_h3s != ["Bridge Notes"]:
        errors.append(
            f"## Learn contains unexpected H3 headings {other_h3s} (only `### Idea N: ...` and `### Bridge Notes` allowed)"
        )
    if len(idea_h3s) != len(fm.get("ideas", [])):
        errors.append(
            f"## Learn has {len(idea_h3s)} `### Idea N:` headings ({idea_h3s}), but front matter `ideas:` has {len(fm.get('ideas', []))} entries ({fm.get('ideas', [])})"
        )
    else:
        for idx, (h3_text, fm_idea) in enumerate(zip(idea_h3s, fm.get("ideas", [])), start=1):
            h3_clean = re.sub(r"^Idea\s+\d+:\s*", "", h3_text)
            kw_h3 = extract_keywords(h3_clean)
            kw_fm = extract_keywords(fm_idea)
            if kw_fm:
                overlap = len(kw_h3 & kw_fm) / max(1, min(len(kw_h3), len(kw_fm)))
                if overlap < 0.5:
                    errors.append(
                        f"`### {h3_text}` does not match declared front matter idea #{idx} (`{fm_idea}`)"
                    )

    for req_phrase in ("**Primary resource:**", "**What to", "**What to skip:**", "**Key takeaway:**"):
        if req_phrase not in learn_sec:
            errors.append(f"## Learn missing `{req_phrase}`")

    # Ensure no Primary/Alternative resource line has multiple HTTP URLs on the same line
    link_re = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
    for line in learn_sec.splitlines():
        if "Primary resource:" in line or "Alternative resource:" in line:
            urls_on_line = link_re.findall(line)
            if len(urls_on_line) > 1:
                errors.append(
                    f"Resource line has {len(urls_on_line)} URLs on a single bullet (split into Primary and Alternative so every URL is heading-checked): {line.strip()[:80]}"
                )

    bridge_m = re.search(r"### Bridge Notes\s*\n(.*?)(?=\n---|\Z)", learn_sec, flags=re.DOTALL)
    if not bridge_m:
        errors.append("## Learn missing `### Bridge Notes` subsection")
    else:
        bridge_text = bridge_m.group(1)
        wc = count_prose_words(bridge_text)
        if not (130 <= wc <= 265):
            errors.append(f"`### Bridge Notes` word count is {wc} words (target: 150–250 words)")
        if re.search(r"^####\s+", bridge_text, flags=re.MULTILINE):
            errors.append("`### Bridge Notes` contains `####` subheadings (extra topics not allowed)")

        # Compare Bridge Notes against declared ideas:
        # 1) Bridge Notes must touch keywords from every declared idea in `ideas:`
        bridge_kw = extract_keywords(bridge_text)
        for idx, fm_idea in enumerate(fm.get("ideas", []), start=1):
            idea_kw = extract_keywords(fm_idea)
            if idea_kw and not (bridge_kw & idea_kw):
                errors.append(
                    f"`### Bridge Notes` does not reference any keywords from declared Idea #{idx} (`{fm_idea}`)"
                )
        # 2) Bridge Notes (excluding Looking Ahead callouts) must not introduce any glossary term defined after this lesson
        if lid in PATH_ORDER_IDS:
            lid_idx = PATH_ORDER_IDS.index(lid)
            bridge_no_lookahead = re.sub(r"^>\s*.*$", "", bridge_text, flags=re.MULTILINE)
            for raw_term, pattern, def_lid in glossary_entries:
                if PATH_ORDER_IDS.index(def_lid) > lid_idx:
                    if re.search(pattern, bridge_no_lookahead, flags=re.IGNORECASE):
                        errors.append(
                            f"`### Bridge Notes` introduces extra/untaught topic '{raw_term}' (defined later in {def_lid})"
                        )

    # 4. Check ## Do it yourself
    diy_sec = sections["## Do it yourself"]
    if "What is simulated and in which tool:" not in diy_sec:
        errors.append("## Do it yourself missing `What is simulated and in which tool:`")
    if "What is real-hardware only:" not in diy_sec:
        errors.append("## Do it yourself missing `What is real-hardware only:`")
    if "### Expected Output" not in diy_sec:
        errors.append("## Do it yourself missing `### Expected Output`")
    for hint_tag in ("Hint 1", "Hint 2", "Full Solution"):
        if hint_tag not in diy_sec:
            errors.append(f"## Do it yourself missing `{hint_tag}`")

    if basename in ARDUINO_ONLY_LESSONS:
        if "```python" in diy_sec:
            errors.append(
                f"Arduino lesson `{basename}` must NOT contain a Python mirror in `## Do it yourself` (move Python mirrors to `tests/`)"
            )
        if "```cpp" not in diy_sec:
            errors.append(f"Arduino lesson `{basename}` missing `cpp` sketch in `## Do it yourself`")
    elif basename in FALSTAD_ONLY_LESSONS:
        if "```python" in diy_sec:
            errors.append(
                f"Falstad circuit lesson `{basename}` must NOT contain a Python mirror in `## Do it yourself` (move Python mirrors to `tests/`)"
            )
        if "$ 1 " not in diy_sec:
            errors.append(f"Falstad circuit lesson `{basename}` missing Falstad netlist (`$ 1 ...`) in `## Do it yourself`")
    else:
        if "```python" not in diy_sec:
            errors.append(f"Python lesson `{basename}` missing `python` code block in `## Do it yourself`")

    # 5. Check ## Common mistakes & troubleshooting
    cm_sec = sections["## Common mistakes & troubleshooting"]
    cm_bullets = re.findall(r"^- \*\*", cm_sec, flags=re.MULTILINE)
    if len(cm_bullets) < 2:
        errors.append(f"## Common mistakes & troubleshooting has {len(cm_bullets)} items (expected >= 2)")

    # 6. Check ## Check yourself
    cy_sec = sections["## Check yourself"]
    questions = re.findall(r"^\d+\.\s+\*\*", cy_sec, flags=re.MULTILINE)
    answers = re.findall(r"<summary><strong>Answer", cy_sec)
    if len(questions) < 2 or len(answers) < len(questions):
        errors.append(
            f"## Check yourself has {len(questions)} questions and {len(answers)} `<details>` answers"
        )

    # 7. Check ## Recap
    recap_sec = sections["## Recap"]
    checkboxes = re.findall(r"^- \[ \]", recap_sec, flags=re.MULTILINE)
    if len(checkboxes) < 2:
        errors.append("## Recap missing readiness checklist (`- [ ]`)")

    return [f"[{rel_path}] {e}" for e in errors]


def main():
    files = get_lesson_files()
    if len(files) != 35:
        print(
            f"ERROR: Expected 35 beginner lesson files (13 Track P + 10 Stage 0 + 3 Track 00 + 4 Track 01 + 5 Track 02), found {len(files)}"
        )
        sys.exit(1)

    glossary_entries = parse_glossary()
    all_errors = []
    for f in files:
        all_errors.extend(lint_file(f, glossary_entries))

    if all_errors:
        print("LESSON LINTER FAILED:")
        for err in all_errors:
            print("  -", err)
        sys.exit(1)

    print(
        f"OK: All {len(files)} beginner lessons passed template, YAML `ideas:` (<=2), Learn/Bridge Notes topic alignment, Bridge Notes word-count, and simulator separation checks."
    )


if __name__ == "__main__":
    main()
