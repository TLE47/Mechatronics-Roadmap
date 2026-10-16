#!/usr/bin/env python3
"""
scripts/clean_tex.py — Enforces clean, readable TeX source across all Markdown files.

1. Strips `\kern0pt` workarounds from inline and display math.
2. Replaces `\text{A}\_\text{B}` and `\texttt{a\_b}` underscore workarounds with clean,
   readable TeX (`\text{A-B}` / `\text{A,B}`) that renders identically in both KaTeX and
   GitHub MathJax without ugly backslash-underscore clutter.
3. Run with `--check` in CI to fail if any `\kern0pt` or `\_` hacks appear in Markdown source,
   or `--write` to normalize all Markdown files in place.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {"node_modules", ".git", "dist", ".aistudio"}


def clean_markdown_tex(text: str) -> str:
    lines = text.splitlines(keepends=True)
    in_fence = False
    out = []
    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith(("```", "~~~")):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence:
            out.append(line)
            continue

        # Protect inline code spans `...` so prose about `\kern0pt` or `\_` inside backticks is untouched
        code_spans: list[str] = []

        def save_code(m: re.Match[str]) -> str:
            code_spans.append(m.group(0))
            return f"\x00CODE{len(code_spans) - 1}\x00"

        masked = re.sub(r"`[^`]+`", save_code, line)

        # 1. Remove \kern0pt
        masked = masked.replace(r"\kern0pt", "")

        # 2. Replace \text{A}\_\text{B} with \text{A-B} and \texttt{A\_B} with \text{A-B}
        while re.search(r"\\text\{([^{}]+)\}\\\_\\text\{([^{}]+)\}", masked):
            masked = re.sub(
                r"\\text\{([^{}]+)\}\\\_\\text\{([^{}]+)\}",
                r"\\text{\1-\2}",
                masked,
            )
        masked = re.sub(r"\\texttt\{([^{}]*?)\\_([^{}]*?)\}", r"\\texttt{\1-\2}", masked)
        masked = masked.replace(r"\_", "-")

        # Restore inline code spans
        for idx, span in enumerate(code_spans):
            masked = masked.replace(f"\x00CODE{idx}\x00", span)

        out.append(masked)
    return "".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check or clean TeX workarounds in Markdown files.")
    parser.add_argument("--check", action="store_true", help="Exit 1 if any file contains \\kern0pt or \\_ outside code")
    parser.add_argument("--write", action="store_true", help="Clean all Markdown files in place")
    args = parser.parse_args()

    dirty_files: list[str] = []
    md_files = sorted(
        p for p in ROOT.rglob("*.md") if not SKIP_DIRS.intersection(p.relative_to(ROOT).parts)
    )

    for md_path in md_files:
        orig = md_path.read_text(encoding="utf-8")
        cleaned = clean_markdown_tex(orig)
        if cleaned != orig:
            rel = md_path.relative_to(ROOT).as_posix()
            dirty_files.append(rel)
            if args.write:
                md_path.write_text(cleaned, encoding="utf-8")

    if args.write:
        print(f"Cleaned TeX in {len(dirty_files)} markdown files.")
        return 0

    if dirty_files:
        print(f"ERROR: Found TeX workarounds (\\kern0pt or \\_) in {len(dirty_files)} files:", file=sys.stderr)
        for f in dirty_files:
            print(f"  - {f}", file=sys.stderr)
        return 1

    print(f"OK: All {len(md_files)} markdown files use clean TeX with 0 \\kern0pt or \\_ hacks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
