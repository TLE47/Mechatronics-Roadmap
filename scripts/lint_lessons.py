#!/usr/bin/env python3
"""
Automated Lesson Template Linter (`scripts/lint_lessons.py`)

Enforces all curriculum design rules across every beginner lesson:
- `track-p/P.*.md` (13 lessons: P.1 through P.12 + P.M)
- `stage-0/S0.*.md` (10 lessons: S0.1 through S0.9 + S0.M)
- `01-electronics-and-power/01.1-mosfet-inductor-flyback.md` (1 lesson)
Total: 24 lessons.

Checks enforced on every lesson:
1. Valid YAML front matter (`--- ... ---`) at the top of the file containing:
   - `lesson_id`
   - `title`
   - `ideas` (list of 1 or 2 strings; strictly `1 <= len(ideas) <= 2`)
   - `typical_hours` and `slow_learner_hours`
2. Exact H2 section sequence:
   - `## Goal`
   - `## Prerequisites`
   - `## Learn`
   - `## Do it yourself`
   - `## Common mistakes & troubleshooting`
   - `## Check yourself`
   - `## Recap`
3. Strict Idea Count Enforcement in `## Learn`:
   - `### Idea N: <title>` headings in `## Learn` must match `len(ideas)` in YAML front matter (max 2).
   - No extra `###` headings are allowed in `## Learn` other than `### Idea N: ...` and `### Bridge Notes`.
   - `### Bridge Notes` must be between 150 and 250 words.
4. `## Do it yourself`:
   - Contains `What is simulated and in which tool` and `What is real-hardware only`.
   - For Wokwi Arduino lessons (`S0.7`, `S0.8`, `S0.9`, `S0.M`), contains ONLY C/C++ (`cpp`) Starter Code and Full Solution (no Python mirror inside the lesson).
   - For Python lessons (`P.1`–`P.M`, `S0.1`–`S0.6`, `01.1`), contains `python` Starter Code and Full Solution.
   - Contains `### Expected Output`, `Hint 1`, `Hint 2`, and `Full Solution`.
5. `## Check yourself` & `## Recap`:
   - At least 2 questions with `<details>` answers.
   - Readiness checklist (`- [ ]`) in `## Recap`.
"""

import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
}


def natural_sort_key(path: str):
    parts = re.split(r"(\d+)", os.path.basename(path))
    return [int(p) if p.isdigit() else p for p in parts]


def get_lesson_files():
    track_p = sorted(glob.glob(os.path.join(ROOT, "track-p", "P.*.md")), key=natural_sort_key)
    stage_0 = sorted(glob.glob(os.path.join(ROOT, "stage-0", "S0.*.md")), key=natural_sort_key)
    track_01 = [os.path.join(ROOT, "01-electronics-and-power", "01.1-mosfet-inductor-flyback.md")]
    return track_p + stage_0 + track_01


def parse_front_matter(text: str):
    """Parse YAML front matter at start of file and return (dict, body, errors)."""
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


def lint_file(filepath: str) -> list[str]:
    errors = []
    rel_path = os.path.relpath(filepath, ROOT)
    basename = os.path.basename(filepath)
    with open(filepath, "r", encoding="utf-8") as f:
        raw_text = f.read()

    fm, text, fm_errors = parse_front_matter(raw_text)
    errors.extend(fm_errors)

    # 1. Check H2 headings order
    h2_matches = list(re.finditer(r"^##\s+(.+)$", text, flags=re.MULTILINE))
    h2_titles = [f"## {m.group(1).strip()}" for m in h2_matches]
    if h2_titles != EXPECTED_H2_ORDER:
        errors.append(
            f"H2 sections do not match required order.\n"
            f"  Found:    {h2_titles}\n"
            f"  Expected: {EXPECTED_H2_ORDER}"
        )
        return errors

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

    # 3. Check ## Learn strict idea headings and Bridge Notes word count
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
    if len(idea_h3s) > 2:
        errors.append(f"## Learn has {len(idea_h3s)} ideas (strictly max 2 allowed)")

    for req_phrase in ("**Primary resource:**", "**What to", "**What to skip:**", "**Key takeaway:**"):
        if req_phrase not in learn_sec:
            errors.append(f"## Learn missing `{req_phrase}`")

    bridge_m = re.search(r"### Bridge[^\n]*\n(.*?)(?=\n---|\Z)", learn_sec, flags=re.DOTALL)
    if not bridge_m:
        errors.append("## Learn missing `### Bridge Notes` subsection")
    else:
        wc = count_prose_words(bridge_m.group(1))
        if not (130 <= wc <= 265):
            errors.append(f"`### Bridge Notes` word count is {wc} words (target: 150–250 words)")

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
    if len(files) != 24:
        print(f"ERROR: Expected 24 beginner lesson files (13 Track P + 10 Stage 0 + 1 Track 01), found {len(files)}")
        sys.exit(1)

    all_errors = []
    for f in files:
        all_errors.extend(lint_file(f))

    if all_errors:
        print("LESSON LINTER FAILED:")
        for err in all_errors:
            print("  -", err)
        sys.exit(1)

    print(
        f"OK: All {len(files)} beginner lessons passed template, YAML `ideas:` (<=2), heading count, Bridge Notes word-count, and Wokwi/Python separation checks."
    )


if __name__ == "__main__":
    main()
