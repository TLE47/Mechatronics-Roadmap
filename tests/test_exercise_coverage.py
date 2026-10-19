"""Tests for `scripts/check_exercise_coverage.py` - the wall that keeps the gap from reopening.

The gate has four jobs, and each one has a case here:
  * a bridge module with no package fails the build;
  * a package missing one of its required files fails the build;
  * every function a suite refuses on must be named on the page, above its solution block;
  * a complete set of packages passes, and `--dry-run` reports without failing.
"""

import contextlib
import io
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_exercise_coverage as gate  # noqa: E402


def write_package(exercises, module, complete=True, refusal=False):
    directory = os.path.join(exercises, module)
    os.makedirs(os.path.join(directory, "faults"), exist_ok=True)
    manifest = {
        "id": module,
        "checks": {"behaviour": "test_behavior.py", "transfer": "test_transfer.py"},
        "faults": {"broken": ["test_behavior.Some.test"]},
        "cheat": {"file": "faults/print_only.py"},
        "delivery": {"workbench_id": "EX." + module},
    }
    with open(os.path.join(directory, "exercise.json"), "w") as handle:
        json.dump(manifest, handle)
    names = ["starter.py", "solution.py", "test_behavior.py", "test_transfer.py",
             "selfcheck.py", "harness.py"]
    if not complete:
        names.remove("test_transfer.py")
    for name in names:
        body = "# fixture\n"
        if name == "test_behavior.py" and refusal:
            # Two refused functions, so a page that names only one is still a finding.
            body += ("\nclass Fake(unittest.TestCase):\n"
                     "    def test_refusals(self):\n"
                     "        with self.assertRaises(ValueError):\n"
                     "            submission.alpha(0.0)\n"
                     "        with self.assertRaises(ValueError):\n"
                     "            submission.beta(-1.0)\n")
        with open(os.path.join(directory, name), "w") as handle:
            handle.write(body)
    with open(os.path.join(directory, "faults", "broken.py"), "w") as handle:
        handle.write("# fixture\n")


class CoverageGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.modules = os.path.join(self.tmp, "modules")
        self.exercises = os.path.join(self.tmp, "exercises")
        for path in (self.modules, self.exercises):
            os.makedirs(path)
        self.saved = (gate.MODULES_DIR, gate.EXERCISES_DIR)
        gate.MODULES_DIR = self.modules
        gate.EXERCISES_DIR = self.exercises
        self.addCleanup(self._restore)

    def _restore(self):
        gate.MODULES_DIR, gate.EXERCISES_DIR = self.saved
        shutil.rmtree(self.tmp, ignore_errors=True)

    def module(self, module_id, body="# fixture\n"):
        with open(os.path.join(self.modules, module_id + ".md"), "w") as handle:
            handle.write(body)

    def page(self, exercise, solution_tail=""):
        """A page with a real exercise section, so the refusal rule has something to read."""
        return "# fixture\n\n## 5. Exercise\n\n" + exercise + "\n\n### Full Solution\n" + solution_tail + "\n"

    def run_gate(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = gate.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_a_module_with_no_package_fails(self):
        self.module("01-electronics.T1.01c")
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 for a bridge module with no package, got {code}; the gate is a "
            f"wall, not a ratchet, so a missing package must fail - check gate.main's return",
        )
        self.assertIn(
            "01-electronics.T1.01c ships no graded exercise package", err,
            f"expected the finding to name the module and say no package was shipped; got "
            f"{err!r} - check the finding text in check_exercise_coverage.check()",
        )

    def test_a_complete_package_passes(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c")
        self.assertEqual(
            self.run_gate()[0], 0,
            "expected a complete package to pass, since a false positive here would make the "
            "gate unusable for the 46 real packages",
        )

    def test_an_incomplete_package_fails(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c", complete=False)
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 for a package missing test_transfer.py, got {code} - check the "
            f"REQUIRED_FILES loop still runs before anything else",
        )
        self.assertIn(
            "missing test_transfer.py", err,
            f"expected the finding to name the missing file, not just the package; got {err!r}",
        )

    def test_one_gap_among_many_graded_modules_still_fails(self):
        for module_id in ("01-electronics.T1.01a", "01-electronics.T1.01b"):
            self.module(module_id)
            write_package(self.exercises, module_id)
        self.module("01-electronics.T1.01c")
        code, out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 when one of three modules ships no package, got {code} - a gate "
            f"that needs every module broken catches nothing",
        )
        self.assertIn(
            "2/3 bridge modules graded", out,
            f"expected the summary line to count 2 of 3 graded; got {out!r} - check the graded "
            f"and total counts in check()",
        )
        self.assertIn(
            "01-electronics.T1.01c", err,
            f"expected the finding to name the ungated module; got {err!r}",
        )

    def test_a_manifest_with_the_wrong_id_fails(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c")
        path = os.path.join(self.exercises, "01-electronics.T1.01c", "exercise.json")
        with open(path) as handle:
            manifest = json.load(handle)
        manifest["id"] = "01-electronics.T1.99z"
        with open(path, "w") as handle:
            json.dump(manifest, handle)
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 for a manifest whose id is not its module's, got {code} - check "
            f"the id comparison in package_problems",
        )
        self.assertIn(
            "not the module id", err,
            f"expected the finding to say the manifest's id is not the module's; got {err!r}",
        )

    def test_a_package_with_no_planted_fault_fails(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c")
        os.remove(os.path.join(self.exercises, "01-electronics.T1.01c", "faults", "broken.py"))
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 for a package with no planted fault, got {code} - a package with "
            f"no fault cannot prove its suite bites",
        )
        self.assertIn(
            "faults/ holds no planted fault", err,
            f"expected the finding to name the empty faults/ directory; got {err!r}",
        )

    def test_a_suite_that_refuses_input_needs_the_page_to_name_it(self):
        self.module("01-electronics.T1.01c", self.page("Compute the droop."))
        write_package(self.exercises, "01-electronics.T1.01c", refusal=True)
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 when a suite refuses input the page never names, got {code} - "
            f"check the refusal sweep still reads test_behavior.py",
        )
        self.assertIn(
            "What the suite refuses", err,
            f"expected the finding to name the missing ladder item; got {err!r} - without the "
            f"item name the page author does not know what to add",
        )
        self.assertIn(
            "alpha", err,
            f"expected both refused functions named in the finding, alpha first; got {err!r}",
        )
        self.assertIn(
            "beta", err,
            f"expected the second refused function named too, so one fixed page is not half-fixed; "
            f"got {err!r}",
        )

    def test_naming_only_one_of_two_refused_functions_is_still_a_finding(self):
        self.module("01-electronics.T1.01c",
                    self.page("5. **What the suite refuses.** `alpha` raises on a zero limit."))
        write_package(self.exercises, "01-electronics.T1.01c", refusal=True)
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 when only one of two refused functions is named, got {code} - "
            f"naming half the contract is still a finding",
        )
        self.assertIn(
            "beta", err,
            f"expected the unnamed half (beta) to be the reported one; got {err!r} - check "
            f"unstated_refusals filters by name",
        )
        self.assertNotIn(
            "alpha,", err,
            f"expected the already-named function not to be listed as missing; got {err!r} - "
            f"reporting both would hide which one is actually absent",
        )

    def test_a_page_that_names_every_refused_function_passes(self):
        self.module("01-electronics.T1.01c",
                    self.page("5. **What the suite refuses.** `alpha` raises on a zero limit; "
                              "`beta` refuses a negative one."))
        write_package(self.exercises, "01-electronics.T1.01c", refusal=True)
        self.assertEqual(
            self.run_gate()[0], 0,
            "expected a page naming every refused function to pass; a finding here would send "
            "an author looking for a defect that is not there",
        )

    def test_a_refusal_mentioned_in_prose_is_not_the_item(self):
        # Found by dogfooding 04-embedded.T3.04a: its package introduction said "the refusal to take
        # an angle outside it" and named every hole, so a word-based rule passed a ladder that never
        # stated a single guard. Only the dedicated item counts.
        self.module("01-electronics.T1.01c",
                    self.page("The package's `alpha` has a refusal for a zero limit and `beta` "
                              "refuses a negative one."))
        write_package(self.exercises, "01-electronics.T1.01c", refusal=True)
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 for a page that only mentions refusals in prose, got {code} - "
            f"the rule must match the dedicated item, not any sentence using the word",
        )
        self.assertIn(
            "What the suite refuses", err,
            f"expected the finding to demand the dedicated item; got {err!r} - this is the "
            f"regression run 49 shipped and run 50 fixed",
        )

    def test_a_refusal_only_under_the_solution_does_not_count(self):
        # The point of reading above `### Full Solution`: the answer block is not the teaching.
        self.module("01-electronics.T1.01c",
                    self.page("Compute the droop.",
                              solution_tail="5. **What the suite refuses.** `alpha` and `beta` raise."))
        write_package(self.exercises, "01-electronics.T1.01c", refusal=True)
        code, _out, err = self.run_gate()
        self.assertEqual(
            code, 1,
            f"expected exit 1 when the refusal item sits under ### Full Solution, got {code} - "
            f"the answer block is not the teaching, so it cannot satisfy the rule",
        )
        self.assertIn(
            "What the suite refuses", err,
            f"expected the finding to demand the item above the solution block; got {err!r}",
        )

    def test_a_package_whose_suite_does_not_refuse_input_is_not_held_to_the_rule(self):
        self.module("01-electronics.T1.01c", self.page("Compute the droop."))
        write_package(self.exercises, "01-electronics.T1.01c")
        self.assertEqual(
            self.run_gate()[0], 0,
            "expected a package whose suite refuses nothing to pass without a refusal item; "
            "demanding one would add a sentence to pages whose guards do not exist",
        )

    def test_dry_run_reports_the_gap_without_failing(self):
        self.module("01-electronics.T1.01c")
        code, _out, err = self.run_gate("--dry-run")
        self.assertEqual(
            code, 0,
            f"expected --dry-run to exit 0 even with findings, got {code} - it is the reporting "
            f"mode a survey run uses before a repair",
        )
        self.assertIn(
            "would fail: 1 finding(s)", err,
            f"expected the dry run to print the finding count it would have failed on; got "
            f"{err!r} - check the label is 'would fail', not 'FAIL'",
        )

    def test_the_repository_itself_passes(self):
        gate.MODULES_DIR = os.path.join(ROOT, "modules")
        gate.EXERCISES_DIR = os.path.join(ROOT, "exercises")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(
                gate.main([]), 0,
                f"expected the repository's own modules and packages to satisfy the gate; a "
                f"finding here is a real gap in the ladder - run scripts/check_exercise_coverage.py "
                f"on its own to read the findings, which print to stderr",
            )
        # The count is the repository's own, read from the output rather than written here: it moves
        # whenever the ladder gains (or splits into) a module, and a hard-coded 44 is how this test
        # would go red for the wrong reason each time.
        graded = re.search(r"(\d+)/(\d+) bridge modules graded", out.getvalue())
        self.assertIsNotNone(
            graded,
            f"expected the summary to count graded modules; got {out.getvalue()!r} - check the "
            f"gate's summary line, which this test reads instead of hard-coding 46",
        )
        self.assertEqual(
            graded.group(1), graded.group(2),
            f"expected every bridge module to be graded, but the summary says "
            f"{graded.group(0)!r} - check which module lost its package",
        )
        self.assertIn(
            "0 missing, 0 incomplete", out.getvalue(),
            f"expected the summary to report no missing or incomplete packages; got "
            f"{out.getvalue()!r} - the counts above can match while a package is incomplete",
        )


if __name__ == "__main__":
    unittest.main()
