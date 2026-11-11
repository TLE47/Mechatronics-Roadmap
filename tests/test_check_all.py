#!/usr/bin/env python3
"""The local verify table must be CI's verify table, and audit extras must be real CI commands.

`scripts/check_all.py` promises the text gates CI's Python job runs, in one command that starts them
in parallel and reports every failure. CI calls that same script (`--ci`), so the two lists cannot
drift: a gate added to the table is a gate CI runs, and a gate deleted locally is a gate CI stops
running. This test holds the three properties the arrangement needs:

1. **CI calls the table** - the text job runs `python3 scripts/check_all.py --ci`.
2. **`--ci` selects the text pass only** - no audit gate (a browser) and no heavy, order-dependent
   sweep; those live in the exercise job, and their commands must still appear in the workflow.
3. **A local run keeps its audit and heavy rows** - `check:labels` runs before a push, and the two
   heavy sweeps still wait for `--full`.

Run: `python3 tests/test_check_all.py` (also discovered by `python3 -m unittest discover`).
"""

import contextlib
import io
import os
import sys
import unittest
from unittest import mock

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_all  # noqa: E402

WORKFLOW = os.path.join(ROOT, ".github", "workflows", "ci.yml")


def workflow_text():
    with open(WORKFLOW, encoding="utf-8") as handle:
        return handle.read()


def audit_specs():
    return [(name, argv) for name, argv, _heavy in check_all.AUDIT_GATES]


class CheckAllParityTests(unittest.TestCase):
    def test_ci_calls_the_same_table(self):
        text = workflow_text()
        self.assertIn(
            "python3 scripts/check_all.py --ci",
            text,
            msg="expected CI's text job to run scripts/check_all.py --ci: a second hand-written list "
            "is the list that drifts, and the local command then grades something CI does not",
        )

    def test_ci_runs_the_order_dependent_sweeps_in_their_own_job(self):
        text = workflow_text()
        for gate in check_all.GATES:
            if not gate[2]:
                continue
            name, argv, _heavy = gate
            with self.subTest(gate=name):
                command = " ".join(argv) if argv[0] == "npm" else "python3 " + " ".join(argv[:2])
                self.assertIn(
                    command,
                    text,
                    msg=f"expected the exercise job to run `{command}`: `--ci` excludes it, so CI "
                    "would stop running it entirely",
                )

    def test_the_ci_selection_is_the_text_pass(self):
        gates = check_all.selected([], full=False, ci=True)
        names = [gate[0] for gate in gates]
        self.assertIn("workflows", names, msg="expected the workflow scan in the text pass")
        self.assertIn("assertions", names, msg="expected the assertion lint in the text pass")
        self.assertNotIn("labels", names, msg="expected --ci to leave the browser-based label audit out")
        self.assertNotIn("exercise_sweep", names, msg="expected --ci to leave the exercise sweep to its job")
        self.assertNotIn("exercise_coverage", names, msg="expected --ci to leave the report reader with the sweep")
        self.assertNotIn("tests", names, msg="expected --ci to leave the discovery run to its job")
        self.assertFalse(
            [gate[0] for gate in gates if gate[2]],
            msg="expected --ci to select no heavy gate: the heavy ones are ordered after the parallel pass",
        )

    def test_every_audit_gate_is_a_real_ci_command(self):
        text = workflow_text()
        for name, argv in audit_specs():
            self.assertIn(
                " ".join(argv),
                text,
                msg=f"expected audit gate {name} to name a command in ci.yml; {' '.join(argv)} is missing",
            )

    def test_every_gate_names_a_file_that_exists(self):
        for name, argv, _heavy in check_all.GATES:
            if argv[0] == "-m" or argv[0] == "npm":
                continue
            path = os.path.join(ROOT, argv[0])
            self.assertTrue(os.path.exists(path), msg=f"expected gate {name} to name a real script; {argv[0]} is missing")
        for name, argv, _heavy in check_all.AUDIT_GATES:
            self.assertEqual(argv[:1], ["npm"], msg=f"expected audit gate {name} to use a command runner, not a Python file")
        names = [gate[0] for gate in [*check_all.GATES, *check_all.AUDIT_GATES]]
        self.assertEqual(len(names), len(set(names)), msg=f"expected one row per gate name; a duplicate would run twice: {names}")

    def test_a_local_run_includes_the_label_audit(self):
        names = [gate[0] for gate in check_all.selected([], full=False)]
        self.assertIn("labels", names, msg="expected the label audit to run before a push")
        labels = next(gate for gate in check_all.AUDIT_GATES if gate[0] == "labels")
        self.assertEqual(
            labels[1],
            ["npm", "run", "check:labels"],
            "expected the label audit to run npm's check:labels command",
        )

    def test_the_heavy_sweeps_are_the_ones_skipped_by_default(self):
        fast = [gate[1][0] for gate in check_all.selected([], full=False)]
        self.assertNotIn("scripts/run_exercise.py", fast, msg="expected the exercise sweep to wait for --full")
        self.assertNotIn("-m", fast, msg="expected the unittest discovery to wait for --full")
        full = [gate[1][0] for gate in check_all.selected([], full=True)]
        self.assertIn("scripts/run_exercise.py", full, msg="expected --full to add the exercise sweep back")


class CheckAllRunTests(unittest.TestCase):
    def test_a_failing_gate_is_reported_and_stops_the_pass(self):
        failing = ("always_fails", ["-c", "raise SystemExit(3)"], False)
        noise = io.StringIO()
        with mock.patch.object(check_all, "GATES", [failing]), contextlib.redirect_stderr(noise):
            record = check_all.run(failing, quiet=True)
        self.assertIn("always_fails", noise.getvalue(), msg="expected the failure detail to be shown to the runner")
        self.assertFalse(record["ok"], msg="expected a gate that exits 3 to be reported as failed, not green")
        self.assertEqual(record["returncode"], 3, msg="expected the gate's own exit status to be kept, not flattened")

    def test_an_unknown_gate_is_a_usage_error(self):
        with self.assertRaises(SystemExit) as caught:
            check_all.selected(["no_such_gate"], full=False)
        self.assertIn("no_such_gate", str(caught.exception), msg="expected the unknown gate name to appear in the error")


if __name__ == "__main__":
    unittest.main()
