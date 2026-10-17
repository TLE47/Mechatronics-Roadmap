"""Tests for `scripts/check_exercise_coverage.py` - the wall that keeps the gap from reopening.

The gate has exactly three jobs, and each one has a case here:
  * a bridge module with no package fails the build;
  * a package missing one of its required files fails the build;
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


def write_package(exercises, module, complete=True):
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
        with open(os.path.join(directory, name), "w") as handle:
            handle.write("# fixture\n")
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

    def module(self, module_id):
        with open(os.path.join(self.modules, module_id + ".md"), "w") as handle:
            handle.write("# fixture\n")

    def run_gate(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = gate.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_a_module_with_no_package_fails(self):
        self.module("01-electronics.T1.01c")
        code, _out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("01-electronics.T1.01c ships no graded exercise package", err)

    def test_a_complete_package_passes(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c")
        self.assertEqual(self.run_gate()[0], 0)

    def test_an_incomplete_package_fails(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c", complete=False)
        code, _out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("missing test_transfer.py", err)

    def test_one_gap_among_many_graded_modules_still_fails(self):
        for module_id in ("01-electronics.T1.01a", "01-electronics.T1.01b"):
            self.module(module_id)
            write_package(self.exercises, module_id)
        self.module("01-electronics.T1.01c")
        code, out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("2/3 bridge modules graded", out)
        self.assertIn("01-electronics.T1.01c", err)

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
        self.assertEqual(code, 1)
        self.assertIn("not the module id", err)

    def test_a_package_with_no_planted_fault_fails(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c")
        os.remove(os.path.join(self.exercises, "01-electronics.T1.01c", "faults", "broken.py"))
        code, _out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("faults/ holds no planted fault", err)

    def test_dry_run_reports_the_gap_without_failing(self):
        self.module("01-electronics.T1.01c")
        code, _out, err = self.run_gate("--dry-run")
        self.assertEqual(code, 0)
        self.assertIn("would fail: 1 finding(s)", err)

    def test_the_repository_itself_passes(self):
        gate.MODULES_DIR = os.path.join(ROOT, "modules")
        gate.EXERCISES_DIR = os.path.join(ROOT, "exercises")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(gate.main([]), 0)
        # The count is the repository's own, read from the output rather than written here: it moves
        # whenever the ladder gains (or splits into) a module, and a hard-coded 44 is how this test
        # would go red for the wrong reason each time.
        graded = re.search(r"(\d+)/(\d+) bridge modules graded", out.getvalue())
        self.assertIsNotNone(graded, out.getvalue())
        self.assertEqual(graded.group(1), graded.group(2), out.getvalue())
        self.assertIn("0 missing, 0 incomplete", out.getvalue())


if __name__ == "__main__":
    unittest.main()
