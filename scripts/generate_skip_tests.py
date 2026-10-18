#!/usr/bin/env python3
"""Generate every bridge module's Skip test from one store.

Each of the 48 modules ships a `### Skip test` - four or five questions on its own `new_concepts:`,
an executable answer key and a pass mark. Those sections were written by hand, one page at a time,
so the same defect the Tier 2 ladder gate had (see `scripts/generate_ladder_gate.py`) is in them:
a mark, a question or a key can be edited on one page and not in its neighbours, and nothing
noticed. This script makes `resources/skip-tests.json` the only copy and renders it, byte for byte,
into every page between the `skip-test` markers.

Checks, all structural:

1. **The store and the pages agree on what exists.** A module on disk with no entry (or the reverse)
   fails, so a new bridge module cannot ship without a Skip test.
2. **Every page renders the store.** A block that differs - including a missing block - fails.
3. **The mark is arithmetic, not prose.** The pass fraction's denominator must equal the number of
   questions, and any fraction the page's `## 7. Checkpoint` attaches to the Skip test must match
   the entry's own mark.
4. **Every declared concept is examined.** Each question's tag names a concept, and every
   `new_concepts:` entry of the module must be named by at least one of *its own* questions.
5. **The answer key runs.** Each key is executed, so a key whose asserts no longer fire fails before
   it is rendered anywhere.

Usage:
    python3 scripts/generate_skip_tests.py            # rewrite every page's block
    python3 scripts/generate_skip_tests.py --check    # exit 1 when stale or a finding
    python3 scripts/generate_skip_tests.py --json     # machine-readable status

Exit-code family: typed (0 pass, 1 findings, 2 usage).
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import re
import sys
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULES = os.path.join(ROOT, "modules")
STORE = os.path.join(ROOT, "resources", "skip-tests.json")

START = "<!-- skip-test:start -->"
END = "<!-- skip-test:end -->"
HEADING = "### Skip test"

CONCEPT = re.compile(r"Concept: ([a-z0-9_]+)")
ROLE = re.compile(r"\[(Recall|Apply|Transfer|SAFETY)\]")
SPACED = re.compile(r"\[Spaced review -> ([^\]]+)\]")
# The Checkpoint writes the fraction either as `(4/5)` or, inside math, `($4/5$)`. Matching only the
# first form made the check pass by silently finding nothing on every page that used the second.
CHECKPOINT_MARK = re.compile(r"\(\$?(\d+)/(\d+)\$?\)\s*on the (?:module )?Skip test")
ASSERT = re.compile(r"^assert ", re.M)
KEY_VAR = re.compile(r"^q(\d+)(?:_|\s*=)", re.M)


def front_matter_concepts(text):
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        return []
    concepts, key = [], None
    for line in match.group(1).splitlines():
        if line.startswith("  - ") and key == "new_concepts":
            concepts.append(line[4:].strip().strip('"'))
        elif ":" in line and not line.startswith(" "):
            name, _, value = line.partition(":")
            key = name.strip() if value.strip() == "" else None
    return concepts


def page_path(module_id):
    return os.path.join(MODULES, module_id + ".md")


PAGES = {name[:-3] for name in os.listdir(MODULES) if name.endswith(".md")}


@lru_cache(maxsize=None)
def concepts_map():
    with open(os.path.join(ROOT, "resources", "legacy-prereq-map.json"), encoding="utf-8") as handle:
        return json.load(handle).get("concepts", {})


@lru_cache(maxsize=None)
def concepts_declared_by(module_id):
    with open(page_path(module_id), encoding="utf-8") as handle:
        return frozenset(front_matter_concepts(handle.read()))


def load_store():
    with open(STORE, encoding="utf-8") as handle:
        return json.load(handle)


def block_bounds(text):
    start = text.find(START)
    end = text.find(END)
    if start < 0 or end < 0 or end < start:
        return None
    return start, end + len(END)


def section_bounds(text):
    head = text.find(HEADING)
    if head < 0:
        return None
    start = head + len(HEADING)
    nxt = re.search(r"^#{2,3} ", text[start:], re.M)
    return start, start + nxt.start() if nxt else len(text)


def render(entry):
    """The marker-wrapped block for one module, with the section's own leading newline."""
    lines = [START]
    for index, question in enumerate(entry["questions"], start=1):
        lines.append("%d. `%s` %s" % (index, question["tag"], question["text"]))
        for letter, option in zip("ABCD", question.get("options", [])):
            lines.append("   - **%s.** %s" % (letter, option))
        lines.extend(question.get("extra", []))
    lines += ["", "**Answer key:**", "```python"]
    lines.extend(entry["key"].split("\n"))
    lines += ["```"]
    lines.append("- **Pass mark:** $%d/%d$%s"
               % (entry["mark"][0], entry["mark"][1], entry["note"]))
    lines.append(END)
    return "\n" + "\n".join(lines) + "\n\n"


def tags_of(entry):
    """Every `[Concept: ...]` a question names, whether plain or inside a spaced-review tag."""
    return {concept for question in entry["questions"] for concept in CONCEPT.findall(question["tag"])}


def own_tags_of(entry):
    """Concepts the questions claim as this module's own: spaced review names an earlier page's
    concept on purpose, so it is not evidence that this page declares it."""
    own = set()
    for question in entry["questions"]:
        if SPACED.match(question["tag"]):
            continue
        own.update(CONCEPT.findall(question["tag"]))
    return own


def check_key(entry):
    """Run one key in a fresh namespace; any exception is a finding for that module."""
    with contextlib.redirect_stdout(io.StringIO()):
        try:
            exec(compile(entry["key"], "<skip-test key>", "exec"), {"__name__": "skip_key"})
        except (Exception, SystemExit) as error:  # noqa: BLE001 - any failure here is the finding
            return "%s: %s" % (type(error).__name__, error)
    return None


def checkpoint_mark(text):
    """The `(earned/of)` a page's Checkpoint attaches to its Skip test, when it states one."""
    start = text.find("## 7. Checkpoint")
    if start < 0:
        return None
    end = text.find(HEADING, start)
    match = CHECKPOINT_MARK.search(text[start:end if end > 0 else len(text)])
    return [int(match.group(1)), int(match.group(2))] if match else None


def spaced_review_report(store=None):
    """Arrows that survived an honesty audit, and the pages that now carry none.

The count is reported, not enforced. A spaced review is only honest when answering the question
needs the named concept: Run 74 removed 28 tags that failed that test rather than repoint them,
and Run 75 wrote a real review for every non-root page, so the remaining hole is the root page,
which has no earlier page to review. It stays a report so a page that loses its review in a later
audit shows up here as a number instead of forcing a fake tag back; `tests/test_skip_tests.py`
asserts the non-root invariant.
"""
    store = store or load_store()
    with_arrow = {}
    for module_id, entry in store.items():
        for question in entry["questions"]:
            if SPACED.search(question["tag"]):
                with_arrow.setdefault(module_id, []).append(question)
    return {
        "arrows": sum(len(q) for q in with_arrow.values()),
        "pages_with_review": len(with_arrow),
        "pages_without_review": sorted(set(store) - set(with_arrow)),
    }


def findings_for(module_id, entry, text):
    found = []
    questions = entry["questions"]
    if not questions:
        found.append("%s has no questions" % module_id)
    mark = entry.get("mark") or [0, 0]
    if mark[1] != len(questions):
        found.append("%s: pass mark %d/%d but %d questions"
                     % (module_id, mark[0], mark[1], len(questions)))
    elif mark[0] * 5 < mark[1] * 4:
        # `docs/ASSESSMENTS.md` sets the bar at 80% of the questions. A mark under it asks less of a
        # reader than the page's own Checkpoint sentence promises.
        found.append("%s: pass mark %d/%d is below the 80%% bar (needs %d/%d)"
                     % (module_id, mark[0], mark[1],
                        -(-mark[1] * 4 // 5), mark[1]))
    checkpoint = checkpoint_mark(text)
    if checkpoint and checkpoint != mark:
        found.append("%s: Checkpoint promises %d/%d on the Skip test, the paper says %d/%d"
                     % (module_id, checkpoint[0], checkpoint[1], mark[0], mark[1]))
    declared = front_matter_concepts(text)
    tagged = tags_of(entry)
    for concept in declared:
        if concept not in tagged:
            found.append("%s: no question examines `%s`" % (module_id, concept))
    for concept in sorted(own_tags_of(entry) - set(declared)):
        found.append("%s: a question tags `%s`, which the page does not declare" % (module_id, concept))
    for index, question in enumerate(questions, start=1):
        spaced = SPACED.match(question["tag"])
        if not spaced:
            continue
        # A spaced review must point at a page that teaches the concept it names: the tags used to
        # name legacy step ids (`00-foundations.T1.01`), which no reader can open.
        target = spaced.group(1).split("—")[0].strip()
        concept = CONCEPT.search(spaced.group(1))
        if target not in PAGES:
            found.append("%s Q%d: spaced review names `%s`, which is not a page" % (module_id, index, target))
        elif concept:
            taught_here = concept.group(1) in concepts_declared_by(target)
            # A legacy concept has no page that declares it; `resources/legacy-prereq-map.json`
            # records the page whose body carries it, and that is the page a reader can open.
            proven = concepts_map().get(concept.group(1), {}).get("page") == target
            if not (taught_here or proven):
                found.append("%s Q%d: spaced review of `%s`, which `%s` neither declares nor teaches"
                             % (module_id, index, concept.group(1), target))
    roles = {role for question in questions for role in ROLE.findall(question["tag"])}
    for required in ("Recall", "Apply", "Transfer"):
        if required not in roles:
            found.append("%s: no [%s] question in the Skip test" % (module_id, required))
    for index, question in enumerate(questions, start=1):
        if not CONCEPT.search(question["tag"]):
            found.append("%s Q%d: tag names no concept" % (module_id, index))
        options = question.get("options", [])
        if options and len(options) != 4:
            found.append("%s Q%d: %d options, expected 4" % (module_id, index, len(options)))
        if options:
            # A multiple-choice question is only checkable through its key: the key must name a
            # letter and assert it, otherwise a paper whose letter points at the wrong option would
            # pass here (nothing else compares the letter with the option text).
            letter = re.search(r"^(q%d_[a-z_]+)\s*=\s*\"([A-D])\"" % index, entry["key"], re.M)
            if not letter:
                found.append("%s Q%d: has options but the key names no choice letter" % (module_id, index))
            elif not re.search(r"^assert .*\b%s\s*==\s*\"%s\"" % (letter.group(1), letter.group(2)),
                               entry["key"], re.M):
                found.append("%s Q%d: the key's choice is never asserted" % (module_id, index))
    key_error = check_key(entry)
    if key_error:
        found.append("%s: the answer key does not run (%s)" % (module_id, key_error))
    key_exercised = {int(number) for number in KEY_VAR.findall(entry["key"])}
    for index in range(1, len(questions) + 1):
        if index not in key_exercised:
            found.append("%s Q%d: the answer key never evaluates it" % (module_id, index))
    if not ASSERT.search(entry["key"]):
        found.append("%s: the answer key contains no assert" % module_id)
    return found


def scan():
    """`(blocking findings, stale pages, rows)`."""
    store = load_store()
    on_disk = set()
    for name in sorted(os.listdir(MODULES)):
        if not name.endswith(".md"):
            continue
        with open(os.path.join(MODULES, name), encoding="utf-8") as handle:
            text = handle.read()
        if HEADING in text:
            on_disk.add(name[:-3])

    findings, stale, rows = [], [], []
    for module_id in sorted(on_disk - set(store)):
        findings.append("%s has a Skip test but no entry in %s" % (module_id, os.path.relpath(STORE, ROOT)))
    for module_id in sorted(set(store) - on_disk):
        findings.append("%s has an entry but no page with a `### Skip test`" % module_id)

    for module_id in sorted(set(store) & on_disk):
        entry = store[module_id]
        with open(page_path(module_id), encoding="utf-8") as handle:
            text = handle.read()
        findings += findings_for(module_id, entry, text)
        bounds = block_bounds(text)
        if bounds is None:
            findings.append("%s has no skip-test markers" % module_id)
            rows.append({"module": module_id, "status": "no markers"})
            continue
        expected = render(entry)
        # The markers sit in the same place the hand-written section did: right under the heading,
        # ending where the next `###` heading starts. Compare the whole span, not just the block.
        span = section_bounds(text)
        current = text[span[0]:span[1]] if span else ""
        if current != expected:
            stale.append("%s renders a different Skip test" % module_id)
        rows.append({"module": module_id, "status": "current" if current == expected else "stale"})
    return findings, stale, rows


def apply():
    store = load_store()
    changed = []
    for module_id in sorted(store):
        path = page_path(module_id)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        span = section_bounds(text)
        if span is None:
            continue
        new_text = text[:span[0]] + render(store[module_id]) + text[span[1]:]
        if new_text != text:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(new_text)
            changed.append(module_id)
    return changed


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="exit 1 when stale or a finding")
    parser.add_argument("--json", action="store_true", help="machine-readable status")
    args = parser.parse_args(argv)

    findings, stale, rows = scan()
    if args.json:
        print(json.dumps({"findings": findings, "stale": stale, "pages": rows,
                          "spaced_reviews": spaced_review_report()}, indent=2))
        return 1 if findings or stale else 0
    if args.check:
        if findings:
            for finding in findings:
                print("ERROR:", finding)
        if stale:
            print("ERROR: %d page(s) render a different Skip test: %s"
                  % (len(stale), ", ".join(row["module"] for row in rows if row["status"] == "stale")))
        if findings or stale:
            print("run python3 scripts/generate_skip_tests.py to rewrite the pages")
            return 1
        store = load_store()
        total = sum(len(store[row["module"]]["questions"]) for row in rows)
        report = spaced_review_report(store)
        print("OK: %d pages render the stored Skip tests (%d questions, all keys run)."
              % (len(rows), total))
        print("    spaced reviews: %d arrow(s) on %d page(s); %d page(s) carry none."
              % (report["arrows"], report["pages_with_review"], len(report["pages_without_review"])))
        return 0

    changed = apply()
    print("rendered %d Skip test(s); %d page(s) changed" % (len(rows), len(changed)))
    for module_id in changed:
        print("  -", module_id)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
