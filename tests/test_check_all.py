#!/usr/bin/env python3
"""The local gate list must be the CI gate list, not a copy that drifted.

`scripts/check_all.py` promises "every gate CI runs, in CI's order". That promise is only worth
something if something checks it, so this test parses the verify step out of
`.github/workflows/ci.yml` (as text - PyYAML is not a dependency here) and compares it with the
script's table in both directions:

1. **A gate added to CI is not silently missing locally** - the next `--check` step lands in the
   workflow and a contributor's one command keeps passing without it.
2. **A gate cannot be quietly dropped** - deleting a row from the script to make a pre-push run go
   green would fail here.

Run: `python3 tests/test_check_all.py` (also discovered by `python3 -m unittest discover`).
"""

import contextlib
import io
import os
import re
import sys
import unittest
from unittest import mock

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_all  # noqa: E402

WORKFLOW = os.path.join(ROOT, ".github", "workflows", "ci.yml")
VERIFY_STEP = "Verify Markdown structure, internal links, Mermaid diagrams & LaTeX math fences"


def verify_commands():
    """The `python3` commands of the verify step, normalised to (target, checks)."""
    with open(WORKFLOW, encoding="utf-8") as handle:
        text = handle.read()
    start = text.index(VERIFY_STEP)
    body = text[start:]
    end = re.search(r"\n\s*#?\s*- name:", body[len(VERIFY_STEP):])
    block = body[: len(VERIFY_STEP) + end.start()] if end else body
    block = re.sub(r"\\\n\s*", " ", block)  # join continuations
    block = re.sub(r"(?m)^\s*#.*$", "", block)  # whole-line comments
    block = re.sub(r"\s+#.*$", "", block)  # trailing comments

    commands = []
    for line in block.splitlines():
        tokens = line.strip().split()
        while tokens and re.match(r"^[A-Z_][A-Z0-9_]*=", tokens[0]):
            tokens.pop(0)  # RUN_EXERCISE_REPORT="..." python3 ... comes before the command
        if not tokens or tokens[0] != "python3":
            continue
        tokens = tokens[1:]  # drop `python3`
        if tokens[:2] == ["-m", "unittest"]:
            commands.append(("unittest", False))
            continue
        script = tokens[0]
        commands.append((script, "--check" in tokens))
    return commands


def gate_specs():
    return [(gate[1][0] if gate[1][0] != "-m" else "unittest", "--check" in gate[1]) for gate in check_all.GATES]


class CheckAllParityTests(unittest.TestCase):
    def test_every_ci_gate_is_in_the_local_command(self):
        ci = verify_commands()
        self.assertGreater(len(ci), 20, msg=f"expected the verify step to carry the whole gate set, parsed only {len(ci)}")
        missing = [spec for spec in ci if spec not in gate_specs()]
        self.assertEqual(
            missing,
            [],
            msg=f"expected scripts/check_all.py to run every CI gate; missing {missing} - add the row, "
            "or CI will catch a drift the local command calls green",
        )

    def test_the_local_command_adds_nothing_ci_does_not_run(self):
        extra = [spec for spec in gate_specs() if spec not in verify_commands()]
        self.assertEqual(
            extra,
            [],
            msg=f"expected the local table to mirror CI exactly; {extra} is not in the workflow's verify step",
        )

    def test_the_order_matches_ci(self):
        ci = [spec for spec in verify_commands() if spec in gate_specs()]
        local = [spec for spec in gate_specs() if spec in ci]
        self.assertEqual(
            ci,
            local,
            msg="expected the gates to run in CI's order; a reordering hides which failure came first",
        )

    def test_every_gate_names_a_file_that_exists(self):
        for name, argv, _heavy in check_all.GATES:
            if argv[0] == "-m":
                continue
            path = os.path.join(ROOT, argv[0])
            self.assertTrue(os.path.exists(path), msg=f"expected gate {name} to name a real script; {argv[0]} is missing")
        names = [gate[0] for gate in check_all.GATES]
        self.assertEqual(len(names), len(set(names)), msg=f"expected one row per gate name; a duplicate would run twice: {names}")

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
