"""The Full Solution a module page prints must pass the package it introduces.

Dogfooding the Track 00 ladders found pages whose pasted Full Solution had drifted from
`exercises/<id>/solution.py`: the page omitted every input guard the suite checks (an empty trace, a
missing calibration key, a negative resistance, a zero inertia), one page had lost `loop_total`
altogether, and `00-foundations.T2.00f` printed no `simulate_discrete`, so a learner who copied the
page failed tests the page never mentioned.

This test makes the page and the package agree: it extracts the `### Full Solution` python block,
writes it to a temporary submission, and runs the package's own `test_*.py` against it through the
same `EXERCISE_TARGET` interface CI uses.
"""

import os
import pathlib
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
LADDER = [
    "00-foundations.T1.00a",
    "00-foundations.T1.00b",
    "00-foundations.T1.00c",
    "00-foundations.T1.00d",
    "00-foundations.T1.00e",
    "00-foundations.T2.00a",
    "00-foundations.T2.00b",
    "00-foundations.T2.00c",
    "00-foundations.T2.00d",
    "00-foundations.T2.00e",
    "00-foundations.T2.00f",
]


def full_solution_block(module_id):
    """The first ```python block after `### Full Solution` in the module page."""
    page = (ROOT / "modules" / (module_id + ".md")).read_text(encoding="utf-8")
    tail = page.split("### Full Solution", 1)[1]
    match = re.search(r"```python\n(.*?)\n```", tail, re.S)
    if match is None:
        raise AssertionError("no python block after '### Full Solution' in " + module_id)
    return match.group(1) + "\n"


class PageSolutionTests(unittest.TestCase):
    def test_each_page_full_solution_passes_its_package(self):
        for module_id in LADDER:
            with self.subTest(module=module_id):
                code = full_solution_block(module_id)
                with tempfile.TemporaryDirectory() as scratch:
                    submission = pathlib.Path(scratch) / "page_solution.py"
                    submission.write_text(code, encoding="utf-8")
                    env = dict(os.environ, EXERCISE_TARGET=str(submission))
                    proc = subprocess.run(
                        [sys.executable, "-m", "unittest", "discover",
                         "-s", str(ROOT / "exercises" / module_id), "-p", "test_*.py"],
                        cwd=str(ROOT), env=env, capture_output=True, text=True,
                    )
                self.assertEqual(
                    proc.returncode, 0,
                    "%s page solution fails its own suite:\n%s\n%s"
                    % (module_id, proc.stdout[-1500:], proc.stderr[-1500:]),
                )


if __name__ == "__main__":
    unittest.main()
