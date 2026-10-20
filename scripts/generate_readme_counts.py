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
    """The 10-step table: two ordered passes, the pages in each, and their focused hours."""
    facts = route_model.facts()
    # Whole hours, allocated so the ten rows add to the total below; the exact sums stay in
    # docs/SIM_ROUTE.md, and the same allocation is what that page's step rows show.
    rounded = generate_sim_route.rounded_step_ranges()
    lines = [
        "| Step | What you can do when it is done | Lessons | Modules (arm + depth) | Focused hours |",
        "| :--- | :--- | ---: | ---: | ---: |",
    ]
    for row in facts["steps"]:
        title = row["title"]
        href = route_model.first_lesson_href_from_row(row)
        if row["depth_module_count"]:
            modules = f"{row['arm_module_count']} + {row['depth_module_count']}"
        else:
            modules = str(row["arm_module_count"]) if row["arm_module_count"] else "—"
        low, high = rounded[str(row["number"])]
        lines.append(
            f"| **[{row['number']} · {title}]({href})** | {row['outcome']} | "
            f"{row['lesson_count']} | {modules} | ≈{low}–{high} |"
        )
    lines.append(
        f"| **10 steps** | **A finished simulated arm, and the checks to prove it** | "
        f"**{facts['lesson_count']}** | "
        f"**{facts['arm_module_count']} + {facts['depth_module_count']}** | "
        f"**{_friendly(facts['arm_low'], facts['arm_high'])}** |"
    )
    lines.append("")
    lines.append(
        "**Two passes, one order.** The hours column is the **arm route**. Take its arm module "
        "in Steps 3–10, then stop at the working arm. The **depth** modules are the optional "
        "second pass, with their own totals in [`docs/DEPTH.md`](docs/DEPTH.md)."
    )
    lines.append("")
    depth = generate_sim_route.depth_facts()
    full = generate_sim_route.full_route_facts()
    lines.append(
        f"_Rounded to whole hours: the ten rows add to {_friendly(facts['arm_low'], facts['arm_high'])} for the arm. "
        f"With the optional depth pass ({generate_sim_route.fmt(depth['low'], depth['high'])} h), "
        f"the full course is {_friendly(full['low'], full['high'])} focused hours. "
        "[`docs/SIM_ROUTE.md`](docs/SIM_ROUTE.md) keeps the page-level decimals._"
    )
    return "\n".join(lines)


def render(text=None):
    if text is None:
        with open(README, encoding="utf-8") as handle:
            text = handle.read()
    facts = route_model.facts()
    route = generate_sim_route.route_facts()
    if (facts["arm_low"], facts["arm_high"]) != (route["low"], route["high"]):
        sys.exit(
            f"the step table's arm hours sum to {facts['arm_low']}-{facts['arm_high']} but the "
            f"arm route sums to {route['low']}-{route['high']}; the step model and ARM_MODULES "
            f"disagree, so one of them is missing or double-counting a module"
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
