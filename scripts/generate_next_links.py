#!/usr/bin/env python3
"""Put the one course sequence on every page's last line.

A learner should never have to decide which page comes next, and should never be able to
leave the sequence by following a link. Before this script the answer depended on where you
looked: `docs/SIM_ROUTE.md` listed Step 3 as `00.1`-`00.3` plus five Tier 1 modules, while
`00.3`'s own "Next lesson" pointed at Track 01 and skipped all five; `00-foundations.T1.00e`
pointed at a legacy id (`00-foundations.T1.01`) that does not exist; `08.1` pointed at the
capstone README's Pass 2 instead of the arm's last page.

The order is not written here. The arm route is `scripts/route_model.py` - the same ten
steps the front page, `docs/SIM_ROUTE.md`, the step pages and the app's roadmap cards print -
restricted to the arm layer (`route_model.module_layer`). The depth pass then follows it in
`docs/DEPTH.md` order, which is `generate_sim_route.DEPTH_MODULES`. Each page gets one
generated line naming its successor and the step it belongs to, wrapped in `next-step`
markers so re-running replaces it instead of stacking a second one.

The arm's last page does not pretend the course is over and it does not chain onward as if
the depth pass were required: it says the arm is finished and offers the depth pass as
optional. The depth pass's last page ends the sequence with `docs/EXTENSIONS.md`.

Module pages keep the line under their required `## 10. Next modules` heading; prose lessons
carry it as the final line.

Usage:
    python3 scripts/generate_next_links.py            # rewrite every routed page
    python3 scripts/generate_next_links.py --check    # exit 1 if any page is stale
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import generate_sim_route  # noqa: E402
import route_model  # noqa: E402

START = "<!-- next-step:start -->"
END = "<!-- next-step:end -->"
BLOCK = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\n?", re.DOTALL)
# Every hand-written shape the pages used: "**Next lesson:**", "👉 **Next Step After Stage 0:**",
# "- **Next step:**", "## 10. Next modules" bodies. One line, containing one link.
NEXT_LINE = re.compile(
    r"(?im)^[ \t]*(?:[-*][ \t]*)?(?:👉[ \t]*)?\*\*Next[^*]*\*\*[^\n]*\]\([^)]*\)[^\n]*$"
)
MODULE_HEADING = re.compile(r"(?m)^##\s*10\.\s*Next modules\s*$")


def arm_chain():
    """The arm route in one order: each step's lessons, then that step's arm modules."""
    chain = []
    for step in route_model.STEPS:
        facts = route_model.step_facts(step)
        for row in facts["lessons"]:
            chain.append(
                {
                    "path": row["path"],
                    "step": facts["number"],
                    "step_title": facts["title"],
                    "label": f"Lesson {row['id']}: {row['title']}",
                    "kind": "lesson",
                }
            )
        for row in facts["arm_modules"]:
            chain.append(
                {
                    "path": f"modules/{row['id']}.md",
                    "step": facts["number"],
                    "step_title": facts["title"],
                    "label": f"{row['id']}: {row['title']}",
                    "kind": "module",
                }
            )
    return chain


def depth_chain():
    """The optional depth pass in `docs/DEPTH.md` order: step by step, Tier 2 then Tier 3.

    The order is the step order, not `DEPTH_MODULES`' own order: that list puts the whole
    Tier 3 line after the whole Tier 2 line, which would send Step 9's practice module back
    to Step 3's derivation module. `DEPTH.md` groups its table by step, and the pass is taken
    "in the same step order" as the arm, so each step's depth rows follow its arm ones.
    """
    modules = route_model.all_modules()
    chain = []
    for step in route_model.STEPS:
        # CORE_MODULES order inside the step is the ladder's teaching order (a, g, b, c, d,
        # h, e, f, i, j), not the ids' alphabetical order; DEPTH.md prints that same order.
        for ident in generate_sim_route.DEPTH_MODULES:
            if ident not in step["modules"]:
                continue
            chain.append(
                {
                    "path": f"modules/{ident}.md",
                    "step": step["number"],
                    "step_title": step["title"],
                    "label": f"{ident}: {modules[ident]['title']}",
                    "kind": "module",
                }
            )
    return chain


def route_chain():
    return arm_chain() + depth_chain()


def relative_link(page_path, target_path):
    rel = os.path.relpath(target_path, os.path.dirname(page_path))
    return rel.replace(os.sep, "/")


def step_link(page, nxt):
    rel = relative_link(page["path"], nxt["path"])
    return f"[Step {nxt['step']} · {nxt['step_title']} — {nxt['label']}]({rel})"


def render(page, nxt, finish=None):
    if finish == "arm":
        line = (
            f"👉 **You have finished the arm route.** The depth pass is optional and starts at "
            f"{step_link(page, nxt)}."
        )
    elif finish == "course":
        extra = relative_link(page["path"], "docs/EXTENSIONS.md")
        line = (
            f"👉 **You have finished the depth pass.** The Extensions in "
            f"[`docs/EXTENSIONS.md`]({extra}) are the last optional page."
        )
    else:
        line = f"👉 **Next:** {step_link(page, nxt)}"
    return f"{START}\n{line}\n{END}\n"


def strip_legacy(text):
    """Remove any previously generated block and the hand-written next line it replaces."""
    text = BLOCK.sub("", text)
    return NEXT_LINE.sub("", text)


def place(page, text, block):
    """Modules put the line under their section heading; lessons end the file with it."""
    text = text.rstrip() + "\n"
    if page["kind"] == "module":
        match = MODULE_HEADING.search(text)
        if match:
            head = text[: match.end()].rstrip() + "\n"
            return head + "\n" + block
    # No `## 10. Next modules` heading (a prose lesson): the line closes the page.
    return text + "\n" + block


def expected(page, nxt, finish):
    path = os.path.join(ROOT, page["path"])
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    return place(page, strip_legacy(text), render(page, nxt, finish))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="exit 1 if any page is stale")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    arm = arm_chain()
    chain = route_chain()
    if len(arm) != 66 or len(chain) != 89:
        raise SystemExit(
            f"the route must be 66 arm pages + 23 depth pages, found {len(arm)} + {len(chain) - len(arm)}"
        )

    stale = []
    for index, page in enumerate(chain):
        nxt = chain[index + 1] if index + 1 < len(chain) else None
        finish = "arm" if index == len(arm) - 1 else ("course" if nxt is None else None)
        want = expected(page, nxt, finish)
        with open(os.path.join(ROOT, page["path"]), encoding="utf-8") as handle:
            have = handle.read()
        if want == have:
            if args.verbose:
                print(f"current  {page['path']}")
            continue
        stale.append(page["path"])
        if not args.check:
            with open(os.path.join(ROOT, page["path"]), "w", encoding="utf-8") as handle:
                handle.write(want)
            if args.verbose:
                print(f"updated  {page['path']}")

    if args.check:
        if stale:
            print(f"{len(stale)} page(s) do not point at the next page in the route:")
            for path in stale:
                print(f"  {path}")
            return 1
        print(f"All {len(chain)} routed pages carry their generated next-page link.")
    else:
        print(f"Rewrote {len(stale)} of {len(chain)} routed pages.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
