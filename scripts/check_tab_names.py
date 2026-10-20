#!/usr/bin/env python3
"""Fail when the app or a learner-facing page points at a tab by position instead of by name.

The workbench used to number every tab twice - once for the plain-English view and once for the
technical one - so "Tab 2" was the Python runner on a lesson page and the resonance lab inside the
app, and the same tab had two different numbers depending on a toggle. A number cannot be made
true, a name can. This check keeps the names in one place (`app/src/data/workbenchTabs.json`),
requires the app to render them, and bans the position form from the pages a learner reads.

Usage:
    python3 scripts/check_tab_names.py          # exit 1 on findings
    python3 scripts/check_tab_names.py --json   # the same, machine-readable
"""

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAB_DATA = os.path.join(ROOT, "app", "src", "data", "workbenchTabs.json")
APP = os.path.join(ROOT, "app", "src", "App.tsx")
CALLOUT = os.path.join(ROOT, "scripts", "generate_run_callouts.py")

# A historical record keeps the words it shipped with; every other page has to be current.
HISTORICAL = {"CHANGELOG.md"}

POSITION = re.compile(r"\bTab\s+\d")


def load_tabs():
    with open(TAB_DATA, encoding="utf-8") as handle:
        return json.load(handle)


def scanned_files():
    patterns = (
        "*.md",
        "*/*.md",
        "*/*/*.md",
        ".github/**/*.md",
        "app/src/**/*.ts",
        "app/src/**/*.tsx",
    )
    paths = set()
    for pattern in patterns:
        paths.update(glob.glob(os.path.join(ROOT, pattern), recursive=True))
    return sorted(
        path
        for path in paths
        if "node_modules" not in path
        and os.path.relpath(path, ROOT) not in HISTORICAL
        and path.endswith((".md", ".ts", ".tsx"))
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="print findings as JSON")
    args = parser.parse_args(argv)

    data = load_tabs()
    tabs = data.get("tabs", {})
    findings = []

    if len(tabs) != 11:
        findings.append("expected 11 tabs in %s, found %d" % (os.path.relpath(TAB_DATA, ROOT), len(tabs)))
    if not data.get("workbenchUrl", "").startswith("https://"):
        findings.append("workbenchUrl must be the public https address the pages link to")
    for tab_id, name in tabs.items():
        if not name.strip():
            findings.append("%s has an empty name" % tab_id)
        if POSITION.search(name):
            findings.append("%s is named by position (%r), not by what it does" % (tab_id, name))
    if len(set(tabs.values())) != len(tabs):
        findings.append("two tabs share a name, so a page cannot say which one it means")

    for path in scanned_files():
        rel = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as handle:
            for number, line in enumerate(handle, 1):
                if POSITION.search(line):
                    findings.append("%s:%d names a tab by position: %s" % (rel, number, line.strip()[:120]))

    with open(APP, encoding="utf-8") as handle:
        app = handle.read()
    for tab_id in tabs:
        shared = [
            "TAB_NAMES['%s']" % tab_id,
            'TAB_NAMES["%s"]' % tab_id,
        ]
        if tab_id == "tab-pyodide":
            shared.append("PYTHON_TAB_NAME")
        if not any(token in app for token in shared):
            findings.append(
                "App.tsx does not render the shared name for %s; a hand-typed label can drift" % tab_id
            )
    # A position is a leading "N. "; a technical label may legitimately start with 25 kHz.
    if re.search(r"(beginner|technical)Label:\s*'\d+\.\s", app):
        findings.append("App.tsx still numbers a tab label")

    with open(CALLOUT, encoding="utf-8") as handle:
        callout = handle.read()
    if "workbenchTabs.json" not in callout:
        findings.append(
            "generate_run_callouts.py does not read the shared tab table, so its pages can name "
            "a different tab from the app"
        )

    if args.json:
        print(json.dumps({"findings": findings}, indent=2))
    elif findings:
        print("ERROR: %d tab-name finding(s):" % len(findings))
        for finding in findings:
            print("  " + finding)
        print("Rename the tab in app/src/data/workbenchTabs.json, or name it instead of numbering it.")
    else:
        print("OK: %d tab names, no position numbers in %d pages or app sources." % (len(tabs), len(scanned_files())))
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
