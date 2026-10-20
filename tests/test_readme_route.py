#!/usr/bin/env python3
"""Tests for the learner-facing route: the ten-step table and the contradiction checker.

The failures that matter here are the ones a reader cannot see without counting:

1. **A step disappears or repeats** - the front page promises "Steps 1-10", so the table must
   name each one exactly once.
2. **A quoted count drifts** - "13 Track P lessons" beside a fourteen-lesson folder is the
   defect the checker exists to catch, and the test proves it is caught, not just claimed.
3. **A second name reaches the front page** - Tier, Pass, Gate and the folder names are internal;
   a newcomer reads "Step".
4. **The generated table goes stale** - a moved module or lesson changes the model, so the
   committed README must equal what the generator renders.

Run: `python3.12 tests/test_readme_route.py` (also discovered by `python3 -m unittest discover`).
"""

import importlib.util
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(SCRIPTS, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


route_model = load("route_model_for_tests", "route_model.py")
generator = load("generate_readme_counts_for_tests", "generate_readme_counts.py")
checker = load("check_consistency_for_tests", "check_consistency.py")
sim_route = load("generate_sim_route_for_tests", "generate_sim_route.py")


class RouteModelTests(unittest.TestCase):
    def test_there_are_ten_steps_numbered_in_order(self):
        numbers = [step["number"] for step in route_model.STEPS]
        self.assertEqual(
            numbers, list(range(1, 11)),
            f"expected the learner route to be Steps 1-10 in order, got {numbers}; a gap or a "
            f"repeated number makes the front-page promise false",
        )

    def test_the_steps_hold_every_required_module_once(self):
        listed = [ident for step in route_model.STEPS for ident in step["modules"]]
        self.assertEqual(
            len(listed), len(set(listed)),
            f"expected each required module in exactly one step, but {len(listed) - len(set(listed))} "
            f"appear twice; a duplicate inflates the hours and the module count",
        )
        self.assertEqual(
            set(listed), set(sim_route.CORE_MODULES),
            "expected the step model and CORE_MODULES to name the same required modules; the "
            "front page and the route page would otherwise describe different courses",
        )

    def test_the_step_hours_are_the_pages_own_metadata(self):
        facts = route_model.facts()
        low = high = 0.0
        for step in route_model.STEPS:
            for row in route_model.step_lessons(step) + route_model.step_modules(step):
                low += row["low"]
                high += row["high"]
        self.assertAlmostEqual(
            facts["low"], low, places=2,
            msg=f"expected the ten steps to sum to {low:.2f} hours from each page's own metadata; "
                f"got {facts['low']:.2f} - a hand-entered subtotal drifts on the next page edit",
        )
        self.assertAlmostEqual(
            facts["high"], high, places=2,
            msg=f"expected the slow end to sum to {high:.2f} hours from the pages; got "
                f"{facts['high']:.2f} - check route_model.step_facts",
        )

    def test_the_step_total_matches_the_generated_route(self):
        route = sim_route.route_facts()
        facts = route_model.facts()
        self.assertEqual(
            (facts["low"], facts["high"]), (route["low"], route["high"]),
            f"expected the step table total {(facts['low'], facts['high'])} to equal the route's "
            f"own sum {(route['low'], route['high'])}; otherwise one of the two summaries omits "
            f"a page the learner is asked to finish",
        )


class GeneratorTests(unittest.TestCase):
    def test_the_committed_readme_is_the_rendered_table(self):
        with open(generator.README, encoding="utf-8") as handle:
            current = handle.read()
        self.assertEqual(
            generator.render(current), current,
            "expected README.md's step table and counts to equal what the generator renders from "
            "the lesson metadata; run scripts/generate_readme_counts.py",
        )

    def test_a_missing_table_marker_is_an_error_not_a_silent_skip(self):
        with self.assertRaises(SystemExit):
            generator.render("no markers here")

    def test_the_table_lists_ten_rows_and_a_total(self):
        table = generator.render_table()
        rows = [line for line in table.splitlines() if line.startswith("| **[")]
        self.assertEqual(
            len(rows), 10,
            f"expected 10 step rows in the generated table, found {len(rows)}; a missing row is a "
            f"step a newcomer never sees",
        )
        self.assertIn("| **10 steps** |", table,
                      "expected a total row so the reader sees the whole route's size at a glance")
        self.assertIn(
            "| Focused hours |", table,
            "expected the hour column to say focused hours, not elapsed hours; an unqualified "
            "total is the 5-10x underestimate a first-time learner plans against",
        )


class ConsistencyTests(unittest.TestCase):
    def setUp(self):
        self.facts = checker.facts()

    def test_the_current_tree_is_consistent(self):
        _, findings = checker.run()
        if findings:
            self.fail(
                "expected the committed pages to agree; run python3.12 "
                "scripts/check_consistency.py and fix each finding:\n" + "\n".join(findings)
            )

    def test_a_stale_lesson_count_is_caught(self):
        """The exact defect: a hand-typed 13 beside a fourteen-lesson Track P folder."""
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "README.md")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("Track P has 13 Track P lessons and no milestone.\n")
            original = checker.markdown_files
            checker.markdown_files = lambda: [("README.md", path)]
            try:
                findings = checker.check_quoted_counts(self.facts)
            finally:
                checker.markdown_files = original
        self.assertTrue(
            any("13 Track P" in finding or "says 13" in finding for finding in findings),
            f"expected a hand-typed 13 Track P lessons to be reported against the folder's 14; "
            f"got {findings} - a checker that misses this one is not doing its job",
        )

    def test_a_second_name_on_the_front_page_is_caught(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "README.md")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("Finish Pass 1, then the Gate, and you are done.\n")
            original = checker.README
            checker.README = path
            try:
                findings = checker.check_learner_vocabulary(self.facts)
            finally:
                checker.README = original
        self.assertTrue(
            any("Pass" in finding for finding in findings)
            and any("Gate" in finding for finding in findings),
            f"expected both 'Pass 1' and 'Gate' to be reported on the front page; got {findings}",
        )

    def test_a_missing_step_row_is_caught(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "README.md")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("<!-- route:lessons -->48<!-- /route -->\n")
            original = checker.README
            checker.README = path
            try:
                findings = checker.check_readme_table(self.facts)
            finally:
                checker.README = original
        self.assertEqual(
            sum(1 for finding in findings if "has no row for Step" in finding), 10,
            f"expected every one of the ten missing rows to be reported; got {findings}",
        )


class StartHereTests(unittest.TestCase):
    """The README's first block and the workbench landing screen must open the same lesson."""

    def setUp(self):
        self.facts = checker.facts()

    def _with_readme(self, text):
        """Run the check against an edited README, then restore the committed one."""
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "README.md")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(text)
            original = checker.README
            checker.README = path
            try:
                return checker.check_start_here(self.facts)
            finally:
                checker.README = original

    def test_the_landing_screen_repeats_the_readme_block(self):
        self.assertEqual(
            checker.check_start_here(self.facts), [],
            "expected the README's Start here heading, link label, note and Lesson 1 path to be "
            "the same on the workbench landing screen; a newcomer arriving at either door must "
            "be told the same first thing",
        )

    def test_a_drifted_heading_is_caught(self):
        with open(checker.README, encoding="utf-8") as handle:
            text = handle.read()
        findings = self._with_readme(
            text.replace("Start here — your first 2 hours", "Start here — your first 3 hours")
        )
        self.assertTrue(
            any("heading" in finding for finding in findings),
            f"expected a README heading the app does not repeat to be reported; got {findings}",
        )

    def test_a_different_lesson_target_is_caught(self):
        with open(checker.README, encoding="utf-8") as handle:
            text = handle.read()
        findings = self._with_readme(
            text.replace(
                "](track-p/P.1-variables-and-data-types.md)",
                "](track-p/P.2-arithmetic-and-order-of-operations.md)",
            )
        )
        self.assertTrue(
            any(
                "P.2-arithmetic-and-order-of-operations" in finding or "Step 1 starts at" in finding
                for finding in findings
            ),
            f"expected a README Lesson 1 link that is not Step 1 to be reported; got {findings}",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
