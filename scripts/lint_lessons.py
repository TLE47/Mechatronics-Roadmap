#!/usr/bin/env python3
"""
Automated Lesson Template Linter (`scripts/lint_lessons.py`)

Enforces all curriculum design rules across every lesson in:
- `track-p/P.*.md` (8 lessons)
- `stage-0/S0.*.md` (8 lessons)
- `01-electronics-and-power/01.1-mosfet-inductor-flyback.md` (1 lesson)

Checks per lesson:
1. Required 7 top-level H2 sections in exact order:
   `Goal` -> `Prerequisites` -> `Learn` -> `Do it yourself` ->
   `Common mistakes & troubleshooting` -> `Check yourself` -> `Recap`
2. Time estimates (both typical learner and slow-learner) in `Goal` or `Prerequisites`.
3. Honest idea counting in `Goal` & `Learn`: at most 2 new ideas (`### Idea 1...`, optional `### Idea 2...`, no `### Idea 3`), with `New syntax:` listed separately.
4. Link-first rule per Idea: exact URL (`https?://...`), verification tag (`[HTTP 200` or `[verify in-app]`), `What to read` / `What to watch`, `What to skip`, `Key takeaway`, plus `### Bridge Notes` between 150 and 250 words.
5. `Do it yourself` states simulator vs. real-hardware, and contains runnable starter code (`### Starter Code`) with `TODO`, `### Expected Output`, and a 3-step collapsible hint ladder (`Hint 1`, `Hint 2`, `Full Solution`).
6. `Common mistakes & troubleshooting` contains concrete beginner failure modes and fixes.
7. `Check yourself` contains 3–5 questions, each with a collapsible `<details>` answer.
8. `Recap` contains summary bullets, a `"You're ready to move on when..."` / `"You're done with ... when..."` checklist (`- [ ]`), and a link to the next lesson/stage/step.
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

LESSON_FILES = (
    sorted((ROOT / "track-p").glob("P.*.md"))
    + sorted((ROOT / "stage-0").glob("S0.*.md"))
    + [ROOT / "01-electronics-and-power/01.1-mosfet-inductor-flyback.md"]
)

REQUIRED_H2 = [
    "Goal",
    "Prerequisites",
    "Learn",
    "Do it yourself",
    "Common mistakes & troubleshooting",
    "Check yourself",
    "Recap",
]


def count_words(text: str) -> int:
    # Remove display math blocks $$...$$ for prose word count or keep inline tokens clean
    cleaned = re.sub(r"`[^`]+`", lambda m: m.group(0).strip("`"), text)
    cleaned = re.sub(r"[\*_~>#]", " ", cleaned)
    words = [w for w in re.split(r"\s+", cleaned.strip()) if w]
    return len(words)


def lint_lesson(path: pathlib.Path) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")

    # 1. H2 sections in exact order
    h2_matches = list(re.finditer(r"^##\s+(.+?)\s*$", text, re.MULTILINE))
    h2_titles = [m.group(1).strip() for m in h2_matches]
    if h2_titles != REQUIRED_H2:
        errors.append(
            f"H2 section mismatch: found {h2_titles}, expected {REQUIRED_H2}"
        )
        return errors

    sections: dict[str, str] = {}
    for idx, m in enumerate(h2_matches):
        start = m.end()
        end = h2_matches[idx + 1].start() if idx + 1 < len(h2_matches) else len(text)
        sections[m.group(1).strip()] = text[start:end]

    # 2. Goal: new ideas, new syntax, typical + slow-learner time estimates
    goal = sections["Goal"]
    if "**New ideas (max 2):**" not in goal:
        errors.append("Goal missing '**New ideas (max 2):**'")
    if "**New syntax:**" not in goal:
        errors.append("Goal missing '**New syntax:**'")
    if "typical:" not in goal.lower() or "slow-learner:" not in goal.lower():
        errors.append(
            "Goal missing explicit Typical and Slow-learner time estimates"
        )

    # 3. Learn section: max 2 ideas, each with URL, verification tag, What to read/watch, What to skip, Key takeaway + Bridge Notes (150-250 words)
    learn = sections["Learn"]
    idea_matches = list(
        re.finditer(r"^###\s+Idea\s+(\d+)\s*:", learn, re.MULTILINE)
    )
    if not (1 <= len(idea_matches) <= 2):
        errors.append(
            f"Learn section must have 1 or 2 ideas, found {len(idea_matches)}"
        )

    bridge_match = re.search(r"^###\s+Bridge Notes\s*$", learn, re.MULTILINE)
    if not bridge_match:
        errors.append("Learn section missing '### Bridge Notes'")
    else:
        bridge_body = learn[bridge_match.end() :].strip()
        wc = count_words(bridge_body)
        if not (150 <= wc <= 250):
            errors.append(
                f"Bridge Notes word count is {wc} words (must be 150–250 words)"
            )

    for idx, im in enumerate(idea_matches):
        idea_num = im.group(1)
        istart = im.end()
        next_h3 = re.search(r"^###\s+", learn[istart:], re.MULTILINE)
        iend = istart + next_h3.start() if next_h3 else len(learn)
        idea_body = learn[istart:iend]

        if "**Primary resource:**" not in idea_body or "http" not in idea_body:
            errors.append(f"Idea {idea_num} missing '**Primary resource:**' URL")
        if "[HTTP 200" not in idea_body and "[verify in-app]" not in idea_body:
            errors.append(f"Idea {idea_num} missing link verification status tag")
        if not re.search(r"\*\*What to (?:read|watch|complete|do)[^*]*\*\*", idea_body):
            errors.append(f"Idea {idea_num} missing '**What to read/watch:**'")
        if "**What to skip:**" not in idea_body:
            errors.append(f"Idea {idea_num} missing '**What to skip:**'")
        if "**Key takeaway:**" not in idea_body:
            errors.append(f"Idea {idea_num} missing '**Key takeaway:**'")

    # 4. Do it yourself: simulator statement, Starter Code with TODO, Expected Output, 3-step Hint Ladder
    diy = sections["Do it yourself"]
    if "**What is simulated and in which tool:**" not in diy:
        errors.append("Do it yourself missing '**What is simulated and in which tool:**'")
    if "**What is real-hardware only:**" not in diy:
        errors.append("Do it yourself missing '**What is real-hardware only:**'")
    if "### Starter Code" not in diy or "TODO" not in diy:
        errors.append("Do it yourself missing '### Starter Code' with 'TODO' markers")
    if "### Expected Output" not in diy:
        errors.append("Do it yourself missing '### Expected Output'")
    for hint_title in [
        "Hint 1 (Concept nudge)",
        "Hint 2 (Formula / structure)",
        "Full Solution",
    ]:
        if hint_title not in diy:
            errors.append(f"Do it yourself missing '{hint_title}'")

    # 5. Common mistakes & troubleshooting: at least 2 bullet items (1+ in milestones)
    trouble = sections["Common mistakes & troubleshooting"]
    bullets = re.findall(r"^\s*-\s+\*\*", trouble, re.MULTILINE)
    if len(bullets) < 1:
        errors.append("Common mistakes & troubleshooting has no bullet items")

    # 6. Check yourself: 3-5 questions with <details> answers
    check = sections["Check yourself"]
    q_count = len(re.findall(r"^\d+\.\s+\*\*", check, re.MULTILINE))
    a_count = len(re.findall(r"<details>", check))
    if not (3 <= q_count <= 5):
        errors.append(f"Check yourself must have 3–5 questions, found {q_count}")
    if a_count < q_count:
        errors.append(
            f"Check yourself has {q_count} questions but only {a_count} <details> answer blocks"
        )

    # 7. Recap: checklist and next lesson link
    recap = sections["Recap"]
    if "### You're ready to move on when..." not in recap and "### You're done with" not in recap:
        errors.append("Recap missing 'You're ready to move on when...' / 'You're done with...' checklist heading")
    if "- [ ]" not in recap:
        errors.append("Recap missing '- [ ]' checklist items")
    if not re.search(r"\*\*Next (?:lesson|stage|step)[^*]*\*\*", recap):
        errors.append("Recap missing '**Next lesson/stage/step:**' link")

    return errors


def main() -> int:
    if len(LESSON_FILES) != 17:
        print(f"Expected 17 lesson files, found {len(LESSON_FILES)}")
        return 1

    total_errors = 0
    for path in LESSON_FILES:
        rel = path.relative_to(ROOT)
        errs = lint_lesson(path)
        if errs:
            total_errors += len(errs)
            print(f"❌ {rel}:")
            for e in errs:
                print(f"   - {e}")
        else:
            print(f"✅ {rel}: all template & word-count checks passed")

    if total_errors > 0:
        print(f"\nFAILED with {total_errors} error(s).")
        return 1

    print(f"\nSUCCESS: All {len(LESSON_FILES)} lessons passed template linting.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
