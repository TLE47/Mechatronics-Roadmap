#!/usr/bin/env python3
"""Tests for `scripts/check_pilot_kit.py` — the one command an operator runs before a sitting.

The runner is small, so the failures worth pinning are the ways it could reassure someone falsely:

1. **A gate that fails but the runner says `ok`** — the whole point is the one-line verdict.
2. **A gate that cannot start at all** (a missing interpreter, a deleted script) crashing the runner
   instead of being reported as the failure it is.
3. **`--only` matching nothing and still exiting 0**, so a typo reads as a pass.
4. **A `--json` mode that is not parseable**, or that disagrees with the human one.
5. **The five real gates drifting away from the kit**: a renamed test file, or a docs gate that no
   longer covers the kit page, would leave this command green while the kit it describes is broken.

Run: `python3 tests/test_check_pilot_kit.py` (also wired into the CI verify step).
"""

import importlib.util
import io
import json
import os
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "check_pilot_kit.py")

spec = importlib.util.spec_from_file_location("check_pilot_kit", SCRIPT)
cp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cp)


def capture(fn, *args, **kwargs):
    """Run `fn` with both streams captured: the runner prints for a person, and the tests read it."""
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = fn(*args, **kwargs)
    return code, out.getvalue() + err.getvalue()


class PilotKitRunnerTests(unittest.TestCase):
    # ---- The real gates ----

    def test_every_gate_passes_on_this_tree(self):
        code, text = capture(cp.main, [])
        self.assertEqual(code, 0, f"expected every pilot gate to pass; the report was:\n{text}")
        self.assertIn(
            "[PASS] 5 pilot gate(s)", text, "expected the summary to say the kit is ready, not just print lines"
        )

    def test_the_five_gates_are_the_kit_itself(self):
        names = [name for name, _ in cp.GATES]
        self.assertEqual(len(cp.GATES), 5, "expected five gates; a new one belongs in the kit page too")
        for expected in ("preflight tests", "follow-up tests", "aggregate tests", "docs name real commands"):
            self.assertIn(expected, names, f"expected the gate {expected!r} to be part of the kit's checks")

    def test_every_gate_names_a_script_that_exists(self):
        for name, argv in cp.GATES:
            for part in argv[1:]:
                if part.startswith(ROOT):
                    self.assertTrue(
                        os.path.exists(part),
                        f"expected the path {part} in gate {name!r} to exist; a renamed script would read as a crash",
                    )

    # ---- The ways it could lie ----

    def test_a_failing_gate_exits_one_and_is_named(self):
        saved = cp.GATES
        cp.GATES = [("broken", [sys.executable, "-c", "raise SystemExit(3)"])]
        try:
            code, text = capture(cp.main, [])
        finally:
            cp.GATES = saved
        self.assertEqual(code, 1, "expected exit 1 when a gate fails: a green summary over a red gate is the bug")
        self.assertIn("FAIL", text, "expected the failing gate's line to be tagged FAIL, not ok")
        self.assertIn("broken", text, "expected the failing gate to be named, so the operator knows what to fix")
        self.assertIn(
            "0 of 1 pilot gate(s) passed", text, "expected the summary to count what passed, not just report an exit"
        )

    def test_a_gate_that_cannot_start_is_a_failure_not_a_crash(self):
        gate = ("missing", [os.path.join(ROOT, "scripts", "not-a-script.py")])
        result = cp.run_gate(gate)
        self.assertEqual(result["ok"], False, "expected a gate whose command cannot start to read as a failure")

    def test_only_matches_a_fragment_and_an_unknown_name_is_an_error(self):
        self.assertEqual(
            len(cp.select(cp.GATES, "follow-up")), 1, "expected the fragment 'follow-up' to name exactly one gate"
        )
        self.assertEqual(cp.select(cp.GATES, "nonsense"), [], "expected an unknown name to select nothing")
        code, text = capture(cp.main, ["--only", "nonsense"])
        self.assertEqual(code, 2, "expected exit 2 for a typo: selecting nothing must not read as a pass")
        self.assertIn("no gate matches", text, "expected the refusal to say nothing matched, not to stay silent")

    # ---- The machine-readable mode ----

    def test_json_parses_and_agrees_with_the_human_report(self):
        code, text = capture(cp.main, ["--json"])
        payload = json.loads(text)
        self.assertEqual(code, 0, "expected exit 0 in JSON mode when every gate passes")
        self.assertIs(payload["ok"], True, "expected the JSON verdict to be true, matching the human summary")
        self.assertEqual(len(payload["gates"]), 5, "expected one entry per gate in the JSON report")
        self.assertTrue(
            all(gate["ok"] for gate in payload["gates"]), "expected every gate entry in the JSON to read as passed"
        )

    def test_a_failing_gate_in_json_mode_exits_one(self):
        saved = cp.GATES
        cp.GATES = [("broken", [sys.executable, "-c", "raise SystemExit(3)"])]
        try:
            code, text = capture(cp.main, ["--json"])
        finally:
            cp.GATES = saved
        self.assertEqual(code, 1, "expected exit 1 in JSON mode when the only gate fails")
        self.assertIs(json.loads(text)["ok"], False, "expected the JSON verdict to be false, not an empty object")


if __name__ == "__main__":
    unittest.main(verbosity=2)
