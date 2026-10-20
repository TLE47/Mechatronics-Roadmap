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
import re
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
start_here = load("generate_start_here_for_tests", "generate_start_here.py")


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

    def test_every_module_is_in_exactly_one_layer_and_the_arm_is_tier1_plus_the_capstone(self):
        """The arm/depth split is the order the reader is told to follow, so it cannot have gaps."""
        for step in route_model.facts()["steps"]:
            arm = {row["id"] for row in step["arm_modules"]}
            depth = {row["id"] for row in step["depth_modules"]}
            self.assertEqual(
                arm & depth, set(),
                f"expected Step {step['number']} to keep {sorted(arm & depth)} in one layer; "
                f"a module cannot be taken before and after the arm",
            )
            self.assertEqual(
                arm | depth, {row["id"] for row in step["modules"]},
                f"expected Step {step['number']}'s layers to cover its modules; the table would "
                f"otherwise hide or duplicate a page",
            )
            for ident in arm:
                if ident != route_model.ARM_CAPSTONE_ID:
                    self.assertIn(
                        ".T1.", ident,
                        f"expected Step {step['number']}'s arm layer to hold only Tier 1 "
                        f"modules and the capstone; {ident} is neither",
                    )
        for step in route_model.facts()["steps"][2:]:
            self.assertGreaterEqual(
                step["arm_module_count"], 1,
                f"expected Step {step['number']} to have an arm module; without one the arm "
                f"order skips the system that step is about",
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
            (facts["arm_low"], facts["arm_high"]), (route["low"], route["high"]),
            f"expected the step table's arm total {(facts['arm_low'], facts['arm_high'])} to "
            f"equal the arm route's own sum {(route['low'], route['high'])}; otherwise one of "
            f"the two summaries omits a page the learner is asked to finish",
        )


class GeneratorTests(unittest.TestCase):
    def test_the_step_rows_add_up_to_the_quoted_total(self):
        """The rounded rows must total the rounded figure beside them.

        Rounding each step independently used to make the ten rows sum to 202–291 while the total
        row said 200–290: every number was individually right and the table still did not add up.
        """
        with open(generator.README, encoding="utf-8") as handle:
            text = handle.read()
        rows = re.findall(r"\| \*\*\[\d+ · .*?\| ≈(\d+)–(\d+) \|", text)
        self.assertEqual(
            len(rows), 10,
            f"expected the ten step rows to carry rounded hour ranges, found {len(rows)}; check "
            f"the generated table's last column",
        )
        total = re.search(r"\| \*\*10 steps\*\* .*?\| \*\*≈(\d+)–(\d+)\*\* \|", text)
        self.assertIsNotNone(
            total,
            "expected the table's total row to quote the rounded range; without it the rows have "
            "nothing to add up to",
        )
        low = sum(int(row[0]) for row in rows)
        high = sum(int(row[1]) for row in rows)
        self.assertEqual(
            (low, high), (int(total.group(1)), int(total.group(2))),
            f"expected the ten rounded step rows to sum to the total row "
            f"({total.group(1)}-{total.group(2)}), got {low}-{high}; round the column "
            f"additively instead of rounding each step on its own",
        )

    def test_track_p_targets_add_up_and_name_the_id_gap(self):
        """The hand-kept Track P table must sum its own rows, and say why P.13 is absent."""
        with open(os.path.join(ROOT, "track-p", "README.md"), encoding="utf-8") as handle:
            text = handle.read()
        rows = re.findall(
            r"\| \*\*\[Lesson P\.[^\]]+\].*?\| ~(\d+)–(\d+) min \(unmeasured\) "
            r"\| ~(\d+)–(\d+) min \(unmeasured\) \|",
            text,
        )
        self.assertEqual(
            len(rows), 14,
            f"expected the 14 Track P lessons to each carry both target columns, found "
            f"{len(rows)}; check the table's row shape",
        )
        low = sum(int(row[0]) for row in rows)
        high = sum(int(row[1]) for row in rows)
        slow_low = sum(int(row[2]) for row in rows)
        slow_high = sum(int(row[3]) for row in rows)
        total = re.search(
            r"\| \*\*Total Track P\*\* .*?\| \*\*≈(\d+)–(\d+) h\*\* "
            r"\| \*\*≈(\d+)–(\d+) h\*\* \|",
            text,
        )
        self.assertIsNotNone(
            total,
            "expected the Track P total row to carry both column sums; without it the table has "
            "nothing to add up to",
        )
        self.assertEqual(
            (low, high, slow_low, slow_high),
            tuple(int(value) * 60 for value in total.groups()),
            f"expected the Track P rows to sum to the totals row "
            f"{tuple(int(value) * 60 for value in total.groups())} minutes, got "
            f"{(low, high, slow_low, slow_high)} - update the total when a target moves",
        )
        self.assertIn(
            "There is no Lesson P.13", text,
            "expected the Track P README to say why the ids skip P.13, so the gap does not read "
            "as a missing lesson",
        )

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
        self.assertIn(
            "| Modules (arm + depth) |", table,
            "expected the module column to name the two passes; without it the sixteen modules "
            "in Step 3 read as one block to do before hardware",
        )
        self.assertIn(
            "**Two passes, one order.**", table,
            "expected the table to state the arm-first order; the reader should not have to "
            "infer it from the counts",
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
    """One JSON file feeds the README block and the workbench landing screen."""

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

    def test_the_committed_readme_is_generated_from_the_shared_file(self):
        with open(checker.README, encoding="utf-8") as handle:
            text = handle.read()
        self.assertEqual(
            start_here.rewrite(text),
            text,
            "expected README.md's Start here block to equal what generate_start_here.py renders "
            "from app/src/data/startHere.json; run scripts/generate_start_here.py",
        )

    def test_the_shared_file_and_the_current_tree_agree(self):
        self.assertEqual(
            checker.check_start_here(self.facts), [],
            "expected the README block, the app's import and the lesson path to come from one "
            "source; a newcomer arriving at either door must be told the same first thing",
        )

    def test_a_drifted_readme_block_is_caught(self):
        with open(checker.README, encoding="utf-8") as handle:
            text = handle.read()
        findings = self._with_readme(
            text.replace("Start here — your first 2 hours", "Start here — your first 3 hours")
        )
        self.assertTrue(
            any("stale" in finding for finding in findings),
            f"expected a hand-edited README block to be reported as stale; got {findings}",
        )

    def test_the_lesson_link_follows_the_lesson_files(self):
        payload = start_here.data()
        self.assertEqual(
            start_here.lesson_path(payload["lessonId"]),
            route_model.STEPS[0]["start"],
            "expected startHere.json's lesson to be Step 1's own page; otherwise the block's "
            "only link leads somewhere the route does not start",
        )

    def test_the_app_does_not_keep_a_typed_copy(self):
        with open(checker.APP_START_HERE, encoding="utf-8") as handle:
            app = handle.read()
        self.assertIn(
            "./data/startHere.json",
            app,
            "expected app/src/startHere.ts to import the shared JSON; without that import the "
            "landing screen reads typed strings that the README generator never sees",
        )
        self.assertNotIn(
            start_here.data()["heading"], app,
            "expected the heading to be read from startHere.json, not typed into startHere.ts",
        )

    def test_missing_markers_are_an_error_not_a_silent_skip(self):
        with self.assertRaises(ValueError):
            start_here.rewrite("# a README with no markers\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
