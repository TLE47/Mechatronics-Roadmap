#!/usr/bin/env python3
"""Tests for `scripts/lint_assertions.py` and `docs/assertion-baseline.json`.

Two things can go wrong with a ratchet, and both are silent:

1. **The bar stops biting** - a message without a cause, or short, passes, and the lint becomes
   decoration. Each clause of the bar is tested on its own, including the exempt `assertRaises`.
2. **The ratchet loosens** - the baseline is raised to match the tree instead of the tree being
   fixed, or a new file starts with debt because nobody added it to the baseline.

Run: `python3 tests/test_lint_assertions.py` (also wired into the CI verify step).
"""

import importlib.util
import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "lint_assertions", os.path.join(ROOT, "scripts", "lint_assertions.py")
)
la = importlib.util.module_from_spec(spec)
spec.loader.exec_module(la)

GOOD = "expected 3.5 A from (12.0 - 5.0)/2.0; received V/R instead - check the back-EMF term"


class AssertionLintTests(unittest.TestCase):
    def findings(self, source):
        return la.problems_in(source, "sample.py")

    def test_a_good_message_passes(self):
        source = f"self.assertAlmostEqual(actual, 3.5, delta=1e-12, msg={GOOD!r})\n"
        self.assertEqual(self.findings(source), [])

    def test_a_positional_message_passes(self):
        source = f"self.assertEqual(actual, 3.5, {GOOD!r})\n"
        self.assertEqual(self.findings(source), [])

    def test_a_missing_message_is_flagged(self):
        self.assertTrue(self.findings("self.assertAlmostEqual(actual, 3.5, delta=1e-12)\n"))

    def test_a_short_message_is_flagged(self):
        self.assertTrue(self.findings("self.assertEqual(actual, 3.5, 'wrong')\n"))

    def test_a_message_without_a_cause_is_flagged(self):
        self.assertTrue(
            self.findings("self.assertEqual(actual, 3.5, 'the current came out as something else entirely, sorry')\n")
        )

    def test_a_non_literal_message_is_flagged(self):
        self.assertTrue(self.findings("self.assertEqual(actual, 3.5, message_variable)\n"))

    def test_assert_raises_is_exempt(self):
        self.assertEqual(self.findings("with self.assertRaises(ValueError):\n    submission.back_emf(0.0, 1.0)\n"), [])

    def test_the_tree_holds_the_ratchet(self):
        problems = la.baseline_findings(la.scan(), la.load_baseline())
        self.assertEqual(problems, [], "the tree is above docs/assertion-baseline.json")

    def test_the_ratchet_catches_a_regression(self):
        results = {"a.py": ["x", "y"], "b.py": ["z"]}
        baseline = {"total": 2, "files": {"a.py": 1, "b.py": 1}}
        problems = la.baseline_findings(results, baseline)
        self.assertTrue(any("a.py: 2" in p for p in problems))
        self.assertTrue(any("total" in p for p in problems))

    def test_the_ratchet_catches_a_new_file(self):
        problems = la.baseline_findings({"new.py": ["x"]}, {"total": 0, "files": {}})
        self.assertTrue(any("new.py" in p for p in problems))

    def test_the_ratchet_refuses_a_raised_baseline(self):
        problems = la.baseline_findings({}, {"total": 5, "files": {"gone.py": 5}})
        self.assertTrue(any("gone.py" in p for p in problems))


class PlanTests(unittest.TestCase):
    """`--plan` names the next package to take, so a round does not need a one-off script."""

    RESULTS = {
        "exercises/01-electronics.T1.01a/test_behavior.py": ["a"] * 7,
        "exercises/01-electronics.T1.01a/test_transfer.py": ["b"] * 3,
        "exercises/05-control.T2.05a/test_behavior.py": ["c"] * 5,
        "exercises/04-embedded.T1.04a/test_behavior.py": [],
    }

    def test_package_of_names_the_package_directory(self):
        self.assertEqual(la.package_of("exercises/01-electronics.T1.01a/test_transfer.py"),
                         "01-electronics.T1.01a")

    def test_package_totals_sum_both_graded_files(self):
        self.assertEqual(la.package_totals(self.RESULTS),
                         [("01-electronics.T1.01a", 10), ("05-control.T2.05a", 5)])

    def test_the_plan_is_paste_ready_and_ranked(self):
        text = la.plan_text(self.RESULTS, limit=6)
        self.assertIn("Burn down the next 2 packages", text)
        self.assertIn("1. 01-electronics.T1.01a (10 weak assertions)", text)
        self.assertIn("Round total: 15 of 15 weak assertions.", text)

    def test_the_plan_truncates_to_the_limit(self):
        self.assertEqual(len(la.package_totals(self.RESULTS)[:1]), 1)
        self.assertNotIn("05-control.T2.05a", la.plan_text(self.RESULTS, limit=1))

    def test_main_prints_the_plan_for_the_real_tree(self):
        import io
        import contextlib
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            self.assertEqual(la.main(["--plan", "1"]), 0)
        self.assertEqual(buffer.getvalue().strip(), la.plan_text(la.scan(), limit=1))
        self.assertIn("Burn down the next 1 package,", buffer.getvalue())

    def test_a_non_positive_limit_is_a_usage_error(self):
        import io
        import contextlib
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            la.main(["--plan", "0"])
        self.assertEqual(caught.exception.code, 2)


class TrackReportTests(unittest.TestCase):
    """The per-track table a burn-down round picks its next packages from."""

    RESULTS = {
        "exercises/00-foundations.T1.00a/test_behavior.py": ["a", "b"],
        "exercises/00-foundations.T2.00c/test_transfer.py": ["c"],
        "exercises/04-embedded.T1.04a/test_behavior.py": ["d"],
        "exercises/04-embedded.T1.04a/test_transfer.py": [],
    }

    def test_track_of_reads_the_package_prefix(self):
        self.assertEqual(la.track_of("exercises/00-foundations.T1.00a/test_behavior.py"),
                         "00-foundations")
        self.assertEqual(la.track_of("exercises/04-embedded.T1.04a/test_transfer.py"),
                         "04-embedded")

    def test_track_totals_group_and_sort_worst_first(self):
        totals = la.track_totals(self.RESULTS)
        self.assertEqual(list(totals), ["00-foundations", "04-embedded"])
        self.assertEqual(totals["00-foundations"], {"total": 3, "files": 2})
        # The clean transfer file is not counted as a file still above zero.
        self.assertEqual(totals["04-embedded"], {"total": 1, "files": 1})

    def test_the_baseline_records_the_same_tracks(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "baseline.json")
            la.write_baseline(self.RESULTS, path)
            with open(path, encoding="utf-8") as handle:
                payload = json.load(handle)
        self.assertEqual(payload["tracks"], la.track_totals(self.RESULTS))
        self.assertEqual(sum(entry["total"] for entry in payload["tracks"].values()),
                         payload["total"])

    def test_the_ratchet_ignores_the_track_table(self):
        results = {"exercises/00-foundations.T1.00a/test_behavior.py": ["a"]}
        baseline = {"total": 1, "files": {"exercises/00-foundations.T1.00a/test_behavior.py": 1},
                    "tracks": {"00-foundations": {"total": 99, "files": 9}}}
        self.assertEqual(la.baseline_findings(results, baseline), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
