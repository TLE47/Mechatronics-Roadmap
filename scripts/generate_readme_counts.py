#!/usr/bin/env python3
"""Render the ten-step table and its counts into README.md.

The front page used to carry hand-typed counts (and once said "13 Track P lessons" beside a
fourteen-row table). Every number a newcomer reads is now generated from `route_model.py`, which
in turn reads each page's own metadata; this script's `--check` mode is what CI runs.

Markers:

    <!-- route:table:start --> ... <!-- route:table:end -->
    <!-- route:lessons -->48<!-- /route -->
    <!-- route:modules -->40<!-- /route -->

Usage:
    python3 scripts/generate_readme_counts.py            # rewrite README.md
    python3 scripts/generate_readme_counts.py --check     # exit 1 if README is stale
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generate_sim_route  # noqa: E402
import route_model  # noqa: E402

README = os.path.join(ROOT, "README.md")
TABLE_OPEN = "<!-- route:table:start -->"
TABLE_CLOSE = "<!-- route:table:end -->"


def _marker(name):
    return f"<!-- route:{name} -->", "<!-- /route -->"


def _replace(text, name, value):
    """Replace every `<!-- route:NAME -->...<!-- /route -->` block, or refuse to guess."""
    open_tag, close_tag = _marker(name)
    pattern = re.compile(re.escape(open_tag) + r".*?" + re.escape(close_tag), re.S)
    if not pattern.search(text):
        sys.exit(
            f"README.md has no {open_tag} marker, so the {name} figure cannot be generated; "
            f"restore the marker around it"
        )
    return pattern.sub(lambda _m: f"{open_tag}{value}{close_tag}", text)


def _friendly(low, high):
    """A table cell is a plan: `≈17–43`, not `16.75–42.5`."""
    return generate_sim_route.friendly_range(low, high)


def render_table():
    """The 10-step table: what a learner can do, how many pages, how many hours."""
    facts = route_model.facts()
    lines = [
        "| Step | What you can do when it is done | Lessons | Modules | Hours |",
        "| :--- | :--- | ---: | ---: | ---: |",
    ]
    for row in facts["steps"]:
        title = row["title"]
        href = route_model.first_lesson_href_from_row(row)
        modules = str(row["module_count"]) if row["module_count"] else "—"
        lines.append(
            f"| **[{row['number']} · {title}]({href})** | {row['outcome']} | "
            f"{row['lesson_count']} | {modules} | {_friendly(row['low'], row['high'])} |"
        )
    lines.append(
        f"| **10 steps** | **A finished simulated arm, and the checks to prove it** | "
        f"**{facts['lesson_count']}** | **{facts['module_count']}** | "
        f"**{_friendly(facts['low'], facts['high'])}** |"
    )
    return "\n".join(lines)


def render(text=None):
    if text is None:
        with open(README, encoding="utf-8") as handle:
            text = handle.read()
    facts = route_model.facts()
    route = generate_sim_route.route_facts()
    if (facts["low"], facts["high"]) != (route["low"], route["high"]):
        sys.exit(
            f"the step table sums to {facts['low']}-{facts['high']} hours but the required route "
            f"sums to {route['low']}-{route['high']}; the step model and CORE_MODULES disagree, so "
            f"one of them is missing or double-counting a module"
        )
    if facts["module_count"] != len(generate_sim_route.CORE_MODULES):
        sys.exit(
            f"the step table lists {facts['module_count']} required modules but CORE_MODULES has "
            f"{len(generate_sim_route.CORE_MODULES)}; a module is in one list and not the other"
        )
    pattern = re.compile(re.escape(TABLE_OPEN) + r".*?" + re.escape(TABLE_CLOSE), re.S)
    if not pattern.search(text):
        sys.exit(
            f"README.md has no {TABLE_OPEN} ... {TABLE_CLOSE} block, so the step table cannot be "
            f"generated; restore the markers around it"
        )
    text = pattern.sub(lambda _m: f"{TABLE_OPEN}\n{render_table()}\n{TABLE_CLOSE}", text)
    # The required-module and optional counts are written by generate_sim_route (they move with
    # CORE_MODULES); this script owns the step table and the total lesson count.
    text = _replace(text, "lessons", str(facts["lesson_count"]))
    return text


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if README.md is stale")
    args = parser.parse_args(argv)

    with open(README, encoding="utf-8") as handle:
        current = handle.read()
    expected = render(current)
    if args.check:
        if current != expected:
            print("README.md stale; run scripts/generate_readme_counts.py")
            return 1
        print("README.md step table and counts are current")
        return 0
    with open(README, "w", encoding="utf-8") as handle:
        handle.write(expected)
    print("wrote README.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
