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
import os
import sys
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
