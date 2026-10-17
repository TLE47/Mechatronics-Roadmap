"""Tests for `scripts/check_exercise_coverage.py` - the ratchet that keeps the gap from reopening.

The gate has exactly four jobs, and each one has a case here:
  * a bridge module with no package and no baseline entry fails the build;
  * the same module passes while it is recorded in the baseline;
  * a baseline entry that has since gained a package fails until it is removed;
  * a package missing one of its required files fails, and cannot be recorded as "allowed".
"""

import contextlib
import io
import json
import os
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
        self.docs = os.path.join(self.tmp, "docs")
        for path in (self.modules, self.exercises, self.docs):
            os.makedirs(path)
        self.saved = (gate.MODULES_DIR, gate.EXERCISES_DIR, gate.BASELINE)
        gate.MODULES_DIR = self.modules
        gate.EXERCISES_DIR = self.exercises
        gate.BASELINE = os.path.join(self.docs, "exercise-baseline.json")
        self.addCleanup(self._restore)

    def _restore(self):
        gate.MODULES_DIR, gate.EXERCISES_DIR, gate.BASELINE = self.saved
        shutil.rmtree(self.tmp, ignore_errors=True)

    def module(self, module_id):
        with open(os.path.join(self.modules, module_id + ".md"), "w") as handle:
            handle.write("# fixture\n")

    def baseline(self, ids):
        with open(gate.BASELINE, "w") as handle:
            json.dump({"allowed_missing": ids}, handle)

    def run_gate(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = gate.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_a_new_gap_fails(self):
        self.module("01-electronics.T1.01c")
        self.baseline([])
        code, _out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("new gap: 01-electronics.T1.01c", err)

    def test_a_baselined_gap_passes(self):
        self.module("01-electronics.T1.01c")
        self.baseline(["01-electronics.T1.01c"])
        self.assertEqual(self.run_gate()[0], 0)

    def test_a_stale_baseline_entry_fails(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c")
        self.baseline(["01-electronics.T1.01c"])
        code, _out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("stale baseline entry", err)

    def test_an_incomplete_package_fails_even_when_baselined(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c", complete=False)
        self.baseline(["01-electronics.T1.01c"])
        code, _out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("missing test_transfer.py", err)

    def test_update_baseline_refuses_an_incomplete_package(self):
        self.module("01-electronics.T1.01c")
        write_package(self.exercises, "01-electronics.T1.01c", complete=False)
        self.baseline([])
        code, _out, err = self.run_gate("--update-baseline")
        self.assertEqual(code, 2)
        self.assertIn("refusing", err)

    def test_update_baseline_records_only_the_real_gaps(self):
        self.module("01-electronics.T1.01c")
        self.module("02-mechanics.T1.02a")
        write_package(self.exercises, "02-mechanics.T1.02a")
        self.baseline([])
        code, _out, _err = self.run_gate("--update-baseline")
        self.assertEqual(code, 0)
        with open(gate.BASELINE) as handle:
            recorded = json.load(handle)["allowed_missing"]
        self.assertEqual(recorded, ["01-electronics.T1.01c"])

    def test_a_baseline_entry_for_a_missing_module_fails(self):
        self.module("01-electronics.T1.01c")
        self.baseline(["01-electronics.T1.01c", "99-ghost.T1.99z"])
        code, _out, err = self.run_gate()
        self.assertEqual(code, 1)
        self.assertIn("does not exist", err)

    def test_the_repository_itself_passes(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(gate.main([]), 0)


if __name__ == "__main__":
    unittest.main()
