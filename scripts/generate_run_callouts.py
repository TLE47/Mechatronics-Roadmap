#!/usr/bin/env python3
"""Put the standard "run this in the workbench" callout on every lesson and module page.

A search result lands on a Markdown page, not on the app, so the page itself has to say where the
code runs. The line names the entry's workbench id - the same string the workbench list and its
search box use - and it is generated from `app/src/data/pythonLessonsData.ts`, the registry the
workbench renders. A page cannot carry a stale or invented id, and a page that gains an entry
gains the callout by re-running this script instead of by someone remembering to retype it.

A lesson page with no entry (the bench lessons S0.1-S0.9, 01.1 and 01.2, which run on hardware or
on the bench) gets the second variant instead: it says there is nothing to load, so a reader does
not go looking, and points at the list that has the entries. The maths ramp R.1-R.6 all carry the
first variant: each is the page a Tier 1 exit-check miss sends a learner to, so the repair runs in
the workbench with the same starter, hints and graded check as the page it repairs. Both variants use the same markers, so a page moving
between them is a replacement, not a second block.

The block names the tab the app actually renders (`app/src/data/workbenchTabs.json`), never a
position. "Tab 2" meant the Python runner on some pages and the resonance lab on others, and the
app numbered every tab twice - once per view - so a number could not be made true. A name can.

It also names the **step** the page belongs to, read from `scripts/route_model.py` - the same ten
steps the front page table, `docs/ROUTE.md` and the app's roadmap cards print. The page used to
say "Track 02" while the app said "Step 5", and a reader had no way to join the two; now the
number on the page is the number on the card. The six ramp pages print "Before Step 1" instead,
because they are the warm-up, not one of the ten.

The block sits directly under the H1 (module pages have no H1, so it opens the body) and is
wrapped in `run-callout` markers, so re-running is idempotent: the old block is removed and
re-inserted rather than stacked.

Usage:
    python3 scripts/generate_run_callouts.py            # write every page
    python3 scripts/generate_run_callouts.py --check    # exit 1 if any page is stale
"""

import argparse
import glob
import json
import os
import re
import sys
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "src", "data", "pythonLessonsData.ts")
TAB_DATA = os.path.join(ROOT, "app", "src", "data", "workbenchTabs.json")

sys.path.insert(0, os.path.join(ROOT, "scripts"))
import route_model  # noqa: E402

STEP_COUNT = len(route_model.STEPS)

# One page and one workbench id per step, from the model: the page cannot pick its own number.
STEP_BY_ID = {}
STEP_BY_PAGE = {}
for _step in route_model.STEPS:
    for _row in route_model.step_lessons(_step):
        STEP_BY_ID.setdefault(_row["id"], _step)
        STEP_BY_PAGE.setdefault(_row["path"], _step)
    for _row in route_model.step_modules(_step) + route_model.step_optional(_step):
        STEP_BY_ID.setdefault(_row["id"], _step)
        STEP_BY_PAGE.setdefault("modules/%s.md" % _row["id"], _step)

# The maths ramp is read before Step 1; it is the one surface that is not a step at all.
PRE_STEP = "Before Step 1 · the school-maths ramp"

with open(TAB_DATA, encoding="utf-8") as _handle:
    _TABS = json.load(_handle)

# Both read from the app's own table, so the page cannot name a tab the strip does not show.
WORKBENCH = _TABS["workbenchUrl"]
PYTHON_TAB = _TABS["tabs"]["tab-pyodide"]

START = "<!-- run-callout:start -->"
END = "<!-- run-callout:end -->"


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def workbench_pages():
    """(workbench id, page path relative to the repo root) for every entry that is a page.

    Parsed from the generated registry rather than from the sources, so the callout can only ever
    name an id the app actually shows. Exercise entries point at `solution.py`; their module page
    is the one a reader lands on, and `exercise.json` already records it.
    """
    text = read(DATA)
    _, sep, payload = text.partition("PYTHON_LESSONS: PythonLessonItem[] =")
    if not sep:
        raise SystemExit("ERROR: %s has no PYTHON_LESSONS array" % DATA)
    entries = json.loads(payload.rstrip().rstrip(";"))
    pages = []
    for entry in entries:
        path = entry["path"]
        if path.endswith(".md"):
            pages.append((entry["id"], path))
            continue
        if not path.startswith("exercises/"):
            continue
        manifest = os.path.join(ROOT, os.path.dirname(path), "exercise.json")
        module = json.loads(read(manifest)).get("module")
        if module:
            pages.append((entry["id"], module))
    seen = {}
    for lesson_id, path in pages:
        if path in seen and seen[path] != lesson_id:
            raise SystemExit("ERROR: %s is claimed by both %s and %s" % (path, seen[path], lesson_id))
        seen[path] = lesson_id
    return pages


def _lesson_id_of(path):
    """The page's own id from its front matter: `lesson_id:` on lessons, `id:` on modules."""
    head = read(path)[:800]
    if not head.startswith("---\n"):
        return None
    front = head[: head.find("\n---\n", 4)]
    match = re.search(r'^(?:lesson_id|id):\s*"?([^"\n]+)', front, re.MULTILINE)
    return match.group(1).strip() if match else None


def no_entry_pages():
    """Lesson and module pages the workbench does not list, with their own id.

    These are the bench lessons (S0.1-S0.9, 01.1, 01.2): a reader who lands on one from a search
    should be told there is no entry rather than left to look for one.
    """
    covered = {path for _, path in workbench_pages()}
    roots = ("track-p", "stage-0", "ramp", "modules") + tuple(
        "%02d-%s" % (n, name)
        for n, name in (
            (0, "foundations"),
            (1, "electronics-and-power"),
            (2, "mechanics-kinematics-dynamics"),
            (3, "sensors-and-actuators"),
            (4, "embedded-and-realtime"),
            (5, "control-and-estimation"),
            (6, "robotics-and-autonomy"),
            (7, "systems-hil-and-production"),
            (8, "capstone-projects"),
        )
    )
    pages = []
    for root in roots:
        for path in sorted(glob.glob(os.path.join(ROOT, root, "*.md"))):
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            if rel in covered:
                continue
            lesson_id = _lesson_id_of(path)
            if lesson_id:
                pages.append((lesson_id, rel))
    return pages


def lesson_url(lesson_id):
    """The workbench with this entry already open: the app reads `?lesson=` on load."""
    return "%s?lesson=%s" % (WORKBENCH, urllib.parse.quote(lesson_id, safe=""))


def step_line(lesson_id=None, page=None):
    """The spine step this page belongs to, rendered for the top of the block.

    Returns "" only when neither the id nor the page is in any step, so a page that claims a
    number it does not have cannot happen: the number comes from `route_model.STEPS`.
    """
    step = STEP_BY_ID.get(lesson_id) if lesson_id else None
    if step is None and page:
        step = STEP_BY_PAGE.get(page)
    if step is None and page and page.startswith("ramp/"):
        return "**%s**" % PRE_STEP
    if step is None:
        return ""
    return "**Step %d of %d · %s**" % (step["number"], STEP_COUNT, step["title"])


def quote(lines):
    """The block's lines as one blockquote: every line prefixed, blank ones as a bare `>`."""
    return "\n".join(("> " + line).rstrip() for line in lines)


def block(lesson_id, page=None):
    """The one callout, rendered from the id and the page's step."""
    head = step_line(lesson_id, page)
    lines = head.split("\n") + [""] if head else []
    lines.append(
        "**Run this in the workbench.** [Open MechaLab with `%s` loaded](%s) - it opens on the "
        "**%s** tab with that entry selected. Starter code, hints and the graded check are ready; "
        "this page is the reading copy, and nothing you type here is saved."
        % (lesson_id, lesson_url(lesson_id), PYTHON_TAB)
    )
    return "%s\n%s\n%s\n" % (START, quote(lines), END)


def empty_block(page=None, lesson_id=None):
    """The same block for a page the workbench does not list: say so, do not send them hunting."""
    head = step_line(lesson_id, page)
    lines = head.split("\n") + [""] if head else []
    lines.append(
        "**No workbench entry for this page.** There is nothing to load in %s for it - its "
        "code runs in your own Python 3 or on the bench, with no starter file or graded check. "
        "The pages that do have one are listed in [%s](%s)." % (PYTHON_TAB, PYTHON_TAB, WORKBENCH)
    )
    return "%s\n%s\n%s\n" % (START, quote(lines), END)


def strip_block(text):
    """Remove an already-generated block and the blank line it owns."""
    return re.sub(
        re.escape(START) + r".*?" + re.escape(END) + r"\n",
        "",
        text,
        flags=re.DOTALL,
    )


def split_front_matter(text):
    """(front matter including its closing `---\\n`, body)."""
    if not text.startswith("---\n"):
        return "", text
    close = text.find("\n---\n", 4)
    if close == -1:
        return "", text
    end = close + len("\n---\n")
    return text[:end], text[end:]


def with_callout(text, lesson_id=None, page=None):
    """The page with its block replaced; `lesson_id=None` renders the "no entry" variant."""
    rendered = block(lesson_id, page) if lesson_id else empty_block(page, lesson_id)
    text = strip_block(text).rstrip("\n") + "\n"
    front, body = split_front_matter(text)
    lines = body.split("\n")
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines) and lines[i].startswith("# "):
        # The H1 stays first; the block follows it, then whatever the page had next.
        head = lines[i]
        tail = "\n".join(lines[i + 1 :]).lstrip("\n")
        new_body = head + "\n\n" + rendered + (("\n" + tail) if tail else "")
    else:
        new_body = rendered + "\n" + body.lstrip("\n")
    return front + ("\n" if front else "") + new_body


def all_pages():
    """(workbench id or None, page path) for every page that gets a block."""
    return workbench_pages() + [(None, rel) for _, rel in no_entry_pages()]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="report stale pages instead of writing")
    args = parser.parse_args(argv)

    pages = all_pages()
    stale = []
    for lesson_id, rel in pages:
        path = os.path.join(ROOT, rel)
        before = read(path)
        after = with_callout(before, lesson_id, rel)
        if before == after:
            continue
        stale.append((lesson_id, rel))
        if not args.check:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(after)

    if args.check:
        if stale:
            print("ERROR: %d page(s) do not carry the current workbench callout:" % len(stale))
            for lesson_id, rel in stale:
                print("  %s  (%s)" % (rel, lesson_id or "no workbench entry"))
            print("Run `python3 scripts/generate_run_callouts.py`.")
            return 1
        print("OK: all %d lesson and module pages carry their generated callout." % len(pages))
        return 0

    print("Updated %d of %d lesson and module pages." % (len(stale), len(pages)))
    for lesson_id, rel in stale:
        print("  %s  (%s)" % (rel, lesson_id or "no workbench entry"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
