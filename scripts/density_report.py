#!/usr/bin/env python3
"""
scripts/density_report.py — Per-lesson cognitive density analyzer for the beginner path.

Computes per lesson across all 35 beginner lessons (`Track P`, `Stage 0`, `Track 00`, `Track 01`, `Track 02`):
- `words`: Total prose & markdown word count (excluding YAML front matter)
- `new_terms`: Number of new glossary terms defined in this lesson (from `resources/glossary.md`)
- `resources`: Number of `Primary resource:` and `Alternative resource:` links in `## Learn`
- `code_blocks`: Number of fenced code blocks (```` ``` ````) excluding Mermaid diagrams
- `density_score`: Normalized composite cognitive density score
  (`words / 250.0 + new_terms * 1.5 + resources * 1.0 + code_blocks * 0.5`)

Usage:
    python3 scripts/density_report.py          # Prints top 5 densest lessons
    python3 scripts/density_report.py --all    # Prints all 35 lessons sorted by density
"""

from __future__ import annotations

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from check_term_order import discover_existing_lessons, parse_glossary  # noqa: E402


def analyze_lesson(lid: str, filepath: str, terms_by_lesson: dict[str, int]) -> dict:
    with open(filepath, "r", encoding="utf-8") as f:
        raw = f.read()

    body = re.sub(r"^---\n.*?\n---\n", "", raw, flags=re.DOTALL)
    words = len(re.findall(r"\b[A-Za-z0-9_']+\b", body))

    learn_m = re.search(r"^## Learn\s*$(.*?)(?=^## |\Z)", body, flags=re.MULTILINE | re.DOTALL)
    learn_sec = learn_m.group(1) if learn_m else ""
    resources = len(
        re.findall(r"^\s*-\s+\*\*(?:Primary|Alternative) resource:\*\*", learn_sec, flags=re.MULTILINE)
    )

    all_fences = re.findall(r"^```(\w*)", body, flags=re.MULTILINE)
    code_blocks = sum(1 for lang in all_fences if lang.lower() != "mermaid")

    new_terms = terms_by_lesson.get(lid, 0)
    density = (words / 250.0) + (new_terms * 1.5) + (resources * 1.0) + (code_blocks * 0.5)

    return {
        "lesson_id": lid,
        "rel_path": os.path.relpath(filepath, ROOT),
        "words": words,
        "new_terms": new_terms,
        "resources": resources,
        "code_blocks": code_blocks,
        "density": density,
    }


def main():
    parser = argparse.ArgumentParser(description="Compute per-lesson density metrics.")
    parser.add_argument("--all", action="store_true", help="Show all lessons instead of top 5 only")
    args = parser.parse_args()

    glossary_entries = parse_glossary()
    terms_by_lesson: dict[str, int] = {}
    for _term, _pat, def_lid in glossary_entries:
        terms_by_lesson[def_lid] = terms_by_lesson.get(def_lid, 0) + 1

    lessons = discover_existing_lessons()
    rows = [analyze_lesson(lid, path, terms_by_lesson) for lid, path in lessons]
    rows.sort(key=lambda r: (r["density"], r["new_terms"], r["words"]), reverse=True)

    shown = rows if args.all else rows[:5]
    print("| Rank | Lesson | File | Words | New Glossary Terms | Resources | Code Blocks | Density Score |")
    print("| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |")
    for idx, r in enumerate(shown, start=1):
        print(
            f"| {idx} | **`{r['lesson_id']}`** | `{r['rel_path']}` | {r['words']} | "
            f"{r['new_terms']} | {r['resources']} | {r['code_blocks']} | {r['density']:.2f} |"
        )


if __name__ == "__main__":
    main()
