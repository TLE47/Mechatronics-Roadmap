#!/usr/bin/env python3
"""Tests for `scripts/check_tab_names.py`, `app/src/data/workbenchTabs.json` and the callout text.

The workbench numbered every tab twice, once per view, so a page saying "Tab 2" pointed at the
Python runner while the app's own header showed "2. Run Python Lessons" and its technical view
showed "9. In-Browser Python Runner" - and a page saying "Tab 2" for the resonance lab was equally
right. The fix is a name per tab, in one file, rendered by the app and written into every page.

The failures that matter:

1. **A numbered label** - a page or a tab strip that points at a position the other view contradicts.
2. **A drifting name** - the app and the callout naming the same tab differently.
3. **A page that names the wrong tab** - P.1 recommending the Python runner while the strip calls it
   something else.
4. **An app label typed by hand** - the table says one thing and App.tsx another.

Run: `python3 tests/test_tab_names.py` (also wired into the CI verify step).
"""

import importlib.util
import json
import os
import re
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = os.path.join(ROOT, "scripts", "check_tab_names.py")
TAB_DATA = os.path.join(ROOT, "app", "src", "data", "workbenchTabs.json")
CALLOUT = os.path.join(ROOT, "scripts", "generate_run_callouts.py")

spec = importlib.util.spec_from_file_location("check_tab_names", CHECK)
ct = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ct)

spec = importlib.util.spec_from_file_location("generate_run_callouts", CALLOUT)
gr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gr)


class TableTests(unittest.TestCase):
    def test_one_name_per_tab(self):
        with open(TAB_DATA, encoding="utf-8") as handle:
            data = json.load(handle)
        self.assertEqual(
            len(data["tabs"]), 12,
            msg="expected the 12 workbench tabs; a missing one means its label has nowhere to come "
                "from and App.tsx would need a hand-typed name again",
        )
        self.assertEqual(
            len(set(data["tabs"].values())), 12,
            msg="expected one unique name per tab; two tabs sharing a name means a page naming one cannot be understood - check workbenchTabs.json",
        )
        self.assertFalse(
            [name for name in data["tabs"].values() if re.search(r"\bTab\s+\d", name)],
            msg="a tab named by position is the failure this check exists to prevent",
        )

    def test_the_url_is_the_public_workbench(self):
        with open(TAB_DATA, encoding="utf-8") as handle:
            data = json.load(handle)
        self.assertTrue(
            data["workbenchUrl"].startswith("https://") and data["workbenchUrl"].endswith("/"),
            msg="expected the public workbench URL with a trailing slash; the callout links this "
                "address, so a relative path would 404 from a GitHub page - check workbenchTabs.json",
        )


class AppTests(unittest.TestCase):
    def test_the_app_renders_the_table(self):
        with open(os.path.join(ROOT, "app", "src", "App.tsx"), encoding="utf-8") as handle:
            app = handle.read()
        for tab_id in ct.load_tabs()["tabs"]:
            with self.subTest(tab=tab_id):
                self.assertIn(
                    "TAB_NAMES", app,
                    msg="expected App.tsx to read the shared names; a hand-typed label can drift "
                        "from the table - check the TAB_NAMES usage",
                )
                self.assertNotRegex(
                    app,
                    r"(beginner|technical)Label:\s*'%s\.\s" % re.escape(tab_id),
                    msg="a numbered tab label is what the two views disagreed about",
                )

    def test_no_position_numbers_anywhere_learner_facing(self):
        self.assertEqual(
            ct.main([]), 0,
            msg="expected no tab named by position; a learner-facing page or app label still does, "
                "and the findings are printed above - check each one and name the tab instead",
        )


class CalloutTests(unittest.TestCase):
    def test_the_callout_names_the_python_tab(self):
        self.assertIn(
            gr.PYTHON_TAB, gr.block("P.1"),
            msg="expected the block to name the tab the app renders; a page recommending a "
                "differently named surface is the mismatch this check exists to catch",
        )
        self.assertNotRegex(
            gr.block("P.1"), r"\bTab\s+\d",
            msg="a position in the callout can be wrong in the other view",
        )

    def test_the_python_tab_name_matches_the_table(self):
        with open(os.path.join(ROOT, "app", "src", "data", "workbenchTabs.json"), encoding="utf-8") as handle:
            name = json.load(handle)["tabs"]["tab-pyodide"]
        self.assertEqual(
            gr.PYTHON_TAB, name,
            msg="expected the generator and the app to read the same name; a difference means "
                "one of them cached a literal - check generate_run_callouts.py",
        )

    def test_the_empty_variant_also_names_the_tab(self):
        page = gr.with_callout("# Title\n\nBody.\n", None)
        self.assertIn(
            gr.PYTHON_TAB, page,
            msg="expected a page with no entry to still name the list it sends the reader to; "
                "an unnamed pointer is the position-numbering problem again",
        )

    def test_p1_recommends_the_same_name_the_app_shows(self):
        with open(os.path.join(ROOT, "track-p", "P.1-variables-and-data-types.md"), encoding="utf-8") as handle:
            page = handle.read()
        block = page[page.index(gr.START) : page.index(gr.END)]
        self.assertIn(
            gr.PYTHON_TAB, block,
            msg="expected Lesson P.1 to recommend the tab by the name the app renders; a page "
                "recommending a different name is the mismatch this fixes",
        )


if __name__ == "__main__":
    unittest.main()
