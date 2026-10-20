#!/usr/bin/env python3
"""Tests for `scripts/generate_spine_data.py` and the app data it writes.

The app's step numbers are only the pages' step numbers if the copy is current. The failures that
matter:

1. **A stale copy** - `route_model.py` gains, renames or reorders a step and `spineData.ts` keeps
   the old one, so the roadmap prints a number no page uses.
2. **A renumbered spine** - the numbers stop being 1..10 in route order, which every breadcrumb
   ("Step 6 of 10") would then spell wrongly.
3. **A missing page** - a step starts on a page that is not in the repo, so its "read this first"
   link 404s.
4. **A shape the app cannot read** - the generated module loses a field `app/src/spine.ts` uses.

Run: `python3 tests/test_spine.py` (also covered by `python3 -m unittest discover -s tests`).
"""

import importlib.util
import os
import re
import sys
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "generate_spine_data.py")
DATA = os.path.join(ROOT, "app", "src", "data", "spineData.ts")

spec = importlib.util.spec_from_file_location("generate_spine_data", SCRIPT)
spine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spine)

FIELDS = [
    "number", "slug", "title", "outcome", "start", "lessons", "modules", "optional", "hours",
]


def committed():
    with open(DATA, encoding="utf-8") as handle:
        return handle.read()


class SpineDataTests(unittest.TestCase):
    def test_committed_file_is_what_the_model_renders_now(self):
        self.assertEqual(
            committed(),
            spine.render(),
            "expected app/src/data/spineData.ts to be current; check scripts/route_model.py "
            "changed a step and re-run python3 scripts/generate_spine_data.py",
        )

    def test_numbers_are_one_to_ten_in_route_order(self):
        steps = spine.payload()["steps"]
        self.assertEqual(
            [step["number"] for step in steps],
            list(range(1, 11)),
            "expected the ten steps to be numbered 1..10 in order; check scripts/route_model.py "
            "for a gap, a repeat or a step inserted in the wrong place",
        )
        self.assertEqual(
            [step["number"] for step in spine.route_model.STEPS],
            [step["number"] for step in steps],
            "expected the copied steps to keep the model's order; check the generator is not "
            "sorting or subsetting them",
        )

    def test_every_step_starts_on_a_page_that_exists(self):
        for step in spine.payload()["steps"]:
            path = os.path.join(ROOT, step["start"])
            with self.subTest(step=step["number"], start=step["start"]):
                self.assertTrue(
                    os.path.isfile(path),
                    "expected every step to start on a page in the repo; check the `start` path "
                    "in scripts/route_model.py for that step",
                )

    def test_each_step_costs_its_pages_arm_plus_depth(self):
        """The card and the runner print these; the syllabus sums the same pages."""
        facts = {row["number"]: row for row in spine.route_model.facts()["steps"]}
        for step in spine.payload()["steps"]:
            cost = step["hours"]
            row = facts[step["number"]]
            with self.subTest(step=step["number"]):
                self.assertAlmostEqual(
                    cost["total"]["low"], row["low"], places=2,
                    msg="expected the step total to be the model's own low sum; a typed hour would "
                        "let the card disagree with the syllabus",
                )
                self.assertAlmostEqual(
                    cost["total"]["high"], row["high"], places=2,
                    msg="expected the step total to be the model's own slow-end sum; check that "
                        "generate_spine_data reads route_model.facts",
                )
                self.assertAlmostEqual(
                    cost["arm"]["low"] + cost["depth"]["low"], cost["total"]["low"], places=2,
                    msg="expected the arm and depth layers to add up to the step total; a gap "
                        "would print two numbers that do not make the third",
                )
                self.assertAlmostEqual(
                    cost["depth"]["high"], row["depth_high"], places=2,
                    msg="expected the depth layer to be the model's depth sum; the depth pass "
                        "must cost only its own modules",
                )

    def test_generated_module_carries_every_field_the_app_reads(self):
        text = committed()
        for field in FIELDS:
            with self.subTest(field=field):
                self.assertIn(
                    "%s:" % field,
                    text,
                    "expected the generated module to carry every field app/src/spine.ts reads; "
                    "check the generator's field list against the interface",
                )
        self.assertRegex(text, r"export const SPINE_SOURCE: SpineStepData\[\] = \[")
        # One object per step, so a lost step cannot hide as a lost field.
        self.assertEqual(
            text.count("\n  {\n"),
            10,
            "expected ten step objects in the module; a smaller count means the generator lost a "
            "step, and a larger one means a step was duplicated",
        )
        # The numbers in the module are the model's, in order: no second numbering in the file.
        self.assertEqual(
            [int(found) for found in re.findall(r"^    number: (\d+),$", text, flags=re.MULTILINE)],
            list(range(1, 11)),
            "expected the numbers in the module to be 1..10 in order; anything else is a second "
            "numbering the app would print beside the pages'",
        )


if __name__ == "__main__":
    unittest.main()
